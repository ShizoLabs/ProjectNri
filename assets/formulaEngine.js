import { Parser } from 'https://cdn.jsdelivr.net/npm/expr-eval@2.0.2/dist/index.mjs';

// Formula engine using expr-eval with dice notation support.
// Exports:
// - computeAll(tokenValues, formulas)
// - recomputeAffected(tokenValues, formulas, changedKeys)

const parser = new Parser({
    operators: {
        // Keep arithmetic and comparisons, disable assignment for safety.
        assignment: false,
    },
});

// Register custom helpers for expressions.
parser.functions.dice = (count, sides) => rollDice(count, sides);

function rollDice(count, sides) {
    const safeCount = Math.max(0, Math.floor(Number(count)) || 0);
    const safeSides = Math.max(1, Math.floor(Number(sides)) || 1);
    let total = 0;
    for (let i = 0; i < safeCount; i += 1) {
        total += Math.floor(Math.random() * safeSides) + 1;
    }
    return total;
}

function normalizeFormulas(formulas) {
    if (!Array.isArray(formulas)) {
        return [];
    }

    return formulas.map((formula, index) => {
        const safe = isPlainObject(formula) ? { ...formula } : {};
        const rawKey = safe.key ?? safe.name ?? `formula_${index + 1}`;
        safe.key = normalizeKey(String(rawKey));
        safe.name = typeof safe.name === 'string' && safe.name.trim() !== '' ? safe.name : safe.key;
        safe.expression = typeof safe.expression === 'string' ? safe.expression : '';
        safe.id = typeof safe.id === 'string' && safe.id.trim() !== '' ? safe.id : `formula-${index + 1}`;
        return safe;
    });
}

function normalizeKey(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'formula';
}

// Replace dice notation like "1d8" or "d6" with "dice(1,8)" / "dice(1,6)".
function normalizeExpression(expression) {
    const withTokens = String(expression).replace(/\|([^|]+)\|/g, (_, name) => normalizeVariableName(name));
    return withTokens.replace(/\b(\d+)?\s*d\s*(\d+)\b/gi, (_, count, sides) => {
        const safeCount = count ? Number(count) : 1;
        return `dice(${safeCount},${Number(sides)})`;
    });
}

function extractVariables(expression) {
    const normalized = normalizeExpression(expression);
    try {
        const parsed = parser.parse(normalized);
        return parsed.variables();
    } catch (error) {
        return [];
    }
}

// Build dependency graph between formulas based on references to other formula keys.
// depsByKey: key -> [dependency keys]
// dependentsByKey: key -> [formula keys that depend on this key]
function buildDependencyGraph(formulas) {
    const formulaKeys = new Set(formulas.map((formula) => formula.key));
    const depsByKey = new Map();
    const dependentsByKey = new Map();

    formulas.forEach((formula) => {
        const vars = extractVariables(formula.expression);
        const deps = vars.filter((variable) => formulaKeys.has(variable));
        depsByKey.set(formula.key, deps);

        deps.forEach((dep) => {
            if (!dependentsByKey.has(dep)) {
                dependentsByKey.set(dep, []);
            }
            dependentsByKey.get(dep).push(formula.key);
        });
    });

    return { depsByKey, dependentsByKey };
}

// Topological sort using Kahn's algorithm.
// If there is a cycle, throws an Error.
function topologicalSort(depsByKey, dependentsByKey) {
    const inDegree = new Map();
    [...depsByKey.keys()].forEach((key) => {
        inDegree.set(key, depsByKey.get(key)?.length ?? 0);
    });

    const queue = [];
    inDegree.forEach((count, key) => {
        if (count === 0) {
            queue.push(key);
        }
    });

    const order = [];
    while (queue.length > 0) {
        const key = queue.shift();
        order.push(key);
        const dependents = dependentsByKey.get(key) ?? [];
        dependents.forEach((dependent) => {
            const next = (inDegree.get(dependent) ?? 0) - 1;
            inDegree.set(dependent, next);
            if (next === 0) {
                queue.push(dependent);
            }
        });
    }

    if (order.length !== inDegree.size) {
        throw new Error('Cycle detected in formulas dependency graph.');
    }

    return order;
}

function evaluateFormula(expression, scope) {
    const normalized = normalizeExpression(expression);
    return parser.evaluate(normalized, scope);
}

// Compute all formulas in dependency order. Returns merged values (token + formulas).
export function computeAll(tokenValues, formulas) {
    const normalized = normalizeFormulas(formulas);
    const { depsByKey, dependentsByKey } = buildDependencyGraph(normalized);
    const order = topologicalSort(depsByKey, dependentsByKey);

    const values = { ...(tokenValues ?? {}) };
    const formulaByKey = new Map(normalized.map((formula) => [formula.key, formula]));

    order.forEach((key) => {
        const formula = formulaByKey.get(key);
        if (!formula) {
            return;
        }
        values[key] = evaluateFormula(formula.expression, values);
    });

    return values;
}

// Compute only formulas affected by changed keys.
// changedKeys can be token keys or formula keys.
export function recomputeAffected(tokenValues, formulas, changedKeys) {
    const normalized = normalizeFormulas(formulas);
    const { depsByKey, dependentsByKey } = buildDependencyGraph(normalized);
    const formulaByKey = new Map(normalized.map((formula) => [formula.key, formula]));

    const changed = new Set(Array.isArray(changedKeys) ? changedKeys : []);
    const affected = new Set();
    const queue = [];

    normalized.forEach((formula) => {
        const deps = depsByKey.get(formula.key) ?? [];
        const hasDirectChange = deps.some((dep) => changed.has(dep));
        if (hasDirectChange || changed.has(formula.key)) {
            affected.add(formula.key);
            queue.push(formula.key);
        }
    });

    while (queue.length > 0) {
        const current = queue.shift();
        const dependents = dependentsByKey.get(current) ?? [];
        dependents.forEach((dependent) => {
            if (!affected.has(dependent)) {
                affected.add(dependent);
                queue.push(dependent);
            }
        });
    }

    if (affected.size === 0) {
        return { ...(tokenValues ?? {}) };
    }

    const order = topologicalSort(depsByKey, dependentsByKey)
        .filter((key) => affected.has(key));

    const values = { ...(tokenValues ?? {}) };
    order.forEach((key) => {
        const formula = formulaByKey.get(key);
        if (!formula) {
            return;
        }
        values[key] = evaluateFormula(formula.expression, values);
    });

    return values;
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeVariableName(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'var';
}

// Export helpers for tests or inspection if needed.
export const _internal = {
    normalizeFormulas,
    normalizeExpression,
    extractVariables,
    buildDependencyGraph,
    topologicalSort,
    rollDice,
};
