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
// Симуляция броска. Сколько раз и сколько сторон у куба (2d6 = два броска куба с 6 сторонами)
function rollDice(count, sides) {
    const safeCount = Math.max(0, Math.floor(Number(count)) || 0);
    const safeSides = Math.max(1, Math.floor(Number(sides)) || 1);
    let total = 0;
    for (let i = 0; i < safeCount; i += 1) {
        total += Math.floor(Math.random() * safeSides) + 1;
    }
    return total;
}
// Нормализует формулу
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
// Нормализуют параметр
function normalizeKey(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'formula';
}
// Replace dice notation like "1d8" or "d6" with "dice(1,8)" / "dice(1,6)".
// Нормализует все выражения типа `|Agility|`
function normalizeExpression(expression) {
    const withTokens = String(expression).replace(/\|([^|]+)\|/g, (_, name) => normalizeVariableName(name));
    return withTokens.replace(/\b(\d+)?\s*d\s*(\d+)\b/gi, (_, count, sides) => {
        const safeCount = count ? Number(count) : 1;
        return `dice(${safeCount},${Number(sides)})`;
    });
}
// Проверяет какие переменные используются в формуле. Необходима для проверки зависимостей между формулами
// Например: |Agility Modifier| + 2d6 = agility_modifier + dice(2,6)
function extractVariables(expression) {
    const normalized = normalizeExpression(expression);
    try {
        const parsed = parser.parse(normalized); // Строит внутреннее дерево выражения
        return parsed.variables(); // Передаём только переменные
    } catch (error) {
        return [];
    }
}
// Определяет и регулирует порядок зависимостей формул
// depsByKey (от кого зависит формула): key -> [dependency keys]
// dependentsByKey (кто зависит от формулы): key -> [formula keys that depend on this key]
/** Пример: 
 * formulas = [
 *  { key: "agility_mod", expression: "floor((agility - 10)/2)" },
 *  { key: "initiative", expression: "agility_mod + proficiency" }
 * ];
 * Выдаст:
 * {
 *  depsByKey: {"agility_mod" → [], "initiative"  → ["agility_mod"]},
 *  dependentsByKey: {"agility_mod" → ["initiative"]}
 * }
 */
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
/**
 * Функция гарантирует, что формула будет вычислена только после всех своих зависимостей.
 * Пример с зависимостями:
 * agility_mod → initiative = Нельзя вычесть инициативу без ловкости, поэтому ["agility_mod", "initiative"]
 * @param {*} depsByKey // От кого зависит
 * @param {*} dependentsByKey // Кто зависит
 */
function topologicalSort(depsByKey, dependentsByKey) {
    // inDegree хранит количество входящих зависимостей
    // (сколько других формул нужно вычислить перед этой)
    const inDegree = new Map();
    // Заполняем inDegree на основе depsByKey
    // depsByKey: key -> [список зависимостей]
    // Если формула зависит от 2 формул → её inDegree = 2
    [...depsByKey.keys()].forEach((key) => {
        inDegree.set(key, depsByKey.get(key)?.length ?? 0);
    });
    // Очередь формул, которые можно вычислять прямо сейчас
    // (те, у которых нет зависимостей)
    const queue = [];
    // Находим формулы с inDegree = 0
    // Это "корневые" формулы — их можно считать первыми
    inDegree.forEach((count, key) => {
        if (count === 0) {
            queue.push(key);
        }
    });
     // Итоговый порядок вычисления
    const order = [];
    // Пока есть формулы без зависимостей
    while (queue.length > 0) {
        const key = queue.shift(); // Берём первую доступную формулу
        order.push(key); // Добавляем её в итоговый порядок вычисления
        // Получаем формулы, которые зависят от текущей
        // dependentsByKey: key -> [формулы, которые от неё зависят]
        const dependents = dependentsByKey.get(key) ?? [];
        // "Удаляем" текущую формулу из графа:
        // уменьшаем количество зависимостей у всех зависимых формул
        dependents.forEach((dependent) => {
            // Уменьшаем счётчик входящих зависимостей
            const next = (inDegree.get(dependent) ?? 0) - 1;
            inDegree.set(dependent, next);
            // Если зависимостей больше не осталось —
            // эту формулу теперь можно вычислять
            if (next === 0) {
                queue.push(dependent);
            }
        });
    }
    // Если количество обработанных формул меньше общего числа,
    // значит есть цикл (например A зависит от B, а B от A)
    if (order.length !== inDegree.size) {
        throw new Error('Cycle detected in formulas dependency graph.');
    }
    // Возвращаем корректный порядок вычисления формул
    return order;
}
/**
 * Функция выдающее значение формулы.
 *  Приводит выражение к техническому виду
 *  Передаёт его в движок
 *  Передаёт все значения переменных через scope
 *  Возвращает число
 * @param {*} expression строка которую ввёл пользователь (agility / 4)
 * @param {*} scope объект со значениями всех переменных ({agility: 16})
 * Пример:
 * normalize → "agility / 4"
 * evaluate → 16 / 4
 * результат → 4
 */
function evaluateFormula(expression, scope) {
    const normalized = normalizeExpression(expression); // Нормализовать выражение к "безопасному" виду для парсера
    return parser.evaluate(normalized, scope);
}
/**
 * Сердце движка.
 * Берёт значения ресурсов (tokenValues) -> Берёт список формул ->
 * Строит зависимости -> Определяет правильный порядок вычисления ->
 * Вычисляет формулы одну за другой -> Возвращает единый объект со всеми значениями.
 * @param {*} tokenValues - обычные ресурсы.
 * @param {*} formulas - формулы.
 * @example
 * tokenValues = {agility: 16, strength: 12}
 * formulas = [{ key: 'agility_mod', expression: 'floor((agility - 10) / 2)' }, { key: 'checkAgility', expression: '1d20 + agility_mod' }]
 * После постройки графа зависимостей:
 *  agility_mod -> [] - agility_mod ни от кого не зависит
 *  checkAgility -> [agility_mod] - checkAgility зависит от agility_mod
 * Scope будет выглядить так:
 *  values = {agility: 16, strength: 12}
 * Пример расчёта конечного:
 *  Первая формула: key = agility_mod
 *      values[key] = evaluateFormula(formula.expression, values);
 *      Подставляем: floor((16 - 10) / 2) = 3
 *      Итог: values = {agility: 16, strength: 12, agility_mod: 3}
 *  Вторая формула: key = checkAgility
 *      dice(1,20) + agility_mod
 *      Допустим кубик дал 14
 *      Тогда итог: values = {agility: 16, strength: 12, agility_mod: 3, checkAgility: 17}
 */
export function computeAll(tokenValues, formulas) {
    // Нормализация формул
    const normalized = normalizeFormulas(formulas);
    // Строим граф зависимостей
    const { depsByKey, dependentsByKey } = buildDependencyGraph(normalized);
    // Строим порядок вычисления
    const order = topologicalSort(depsByKey, dependentsByKey);
    // Создаём scope
    const values = { ...(tokenValues ?? {}) };
    // Создаём быстрый доступ к формулам
    const formulaByKey = new Map(normalized.map((formula) => [formula.key, formula]));
    // Расчёт по порядку
    order.forEach((key) => {
        const formula = formulaByKey.get(key);
        if (!formula) {
            return;
        }
        try {
            values[key] = evaluateFormula(formula.expression, values);
        } catch (e) {
            values[key] = null;
        }
    });

    return values;
}
/**
 * Оптимизированный калькулятора расчётов. 
 * Считает только те формулы, которые реально зависят от изменённых значений.
 * 
 * @param {*} tokenValues 
 * @param {*} formulas 
 * @param {*} changedKeys 
 * @example
 * tokenValues = {agility: 16, strength: 12}
 * formulas = [
 *  { key: 'agility_mod', expression: 'floor((agility - 10) / 2)' },
 *  { key: 'attackBonus', expression: 'strength_mod + proficiency' },
 *  { key: 'checkAgility', expression: '1d20 + agility_mod' }
 * ]
 * При изменений agility нужно будет пересчитать только agility_mod и checkAgility 
 */
export function recomputeAffected(tokenValues, formulas, changedKeys) {
    // Строим граф зависимостей
    const normalized = normalizeFormulas(formulas);
    const { depsByKey, dependentsByKey } = buildDependencyGraph(normalized);
    // Быстрый доступ к формулам
    const formulaByKey = new Map(normalized.map((formula) => [formula.key, formula]));
    // Set нужен для быстрого поиска через .has()
    const changed = new Set(Array.isArray(changedKeys) ? changedKeys : []);
    const affected = new Set();
    const queue = [];
    // Определяем напрямую затронутые формулы
    normalized.forEach((formula) => {
        const deps = depsByKey.get(formula.key) ?? []; // Берём её зависимости.
        // Если формула зависит от того, что изменилось — она affected.
        // ИЛИ если сама формула изменилась:
        const hasDirectChange = deps.some((dep) => changed.has(dep));
        if (hasDirectChange || changed.has(formula.key)) {
            affected.add(formula.key);
            queue.push(formula.key);
        }
    });
    // Распространяем волну зависимостей (BFS)
    // Сначала ближайшие зависимые формулы, потом те кто зависят от них
    // Пример: 
    // В очередь кладём первую затронутую формулу queue = ["agility_mod"]
    while (queue.length > 0) {
        const current = queue.shift(); // Берем текущую формулу/параметр
        const dependents = dependentsByKey.get(current) ?? []; // Кто от неё зависит
        // Добавляем зависимых от current
        dependents.forEach((dependent) => {
            if (!affected.has(dependent)) {
                affected.add(dependent);
                queue.push(dependent);
            }
        });
    }
    // Если изменилось agility_mod, то: affected = ['agility_mod', 'checkAgility']
    // Чек если никто не был затронут
    if (affected.size === 0) {
        return { ...(tokenValues ?? {}) };
    }
    // Получаем полный правильный порядок + Оставляем только затронутые формулы
    const order = topologicalSort(depsByKey, dependentsByKey)
        .filter((key) => affected.has(key));
    // Вычисляем только их
    const values = { ...(tokenValues ?? {}) };
    order.forEach((key) => {
        const formula = formulaByKey.get(key);
        if (!formula) {
            return;
        }
        values[key] = evaluateFormula(formula.expression, values);
    });
    // Возвращаем только обновлённые значения
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
