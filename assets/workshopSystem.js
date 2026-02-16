import { Parser } from 'https://cdn.jsdelivr.net/npm/expr-eval@2.0.2/dist/index.mjs';

const root = document.querySelector('[data-workshop-builder]');

if (root) {
    const editable = root.dataset.editable === 'true';
    const payload = window.WORKSHOP_SYSTEM ?? {};

    const parser = createExpressionParser();
    const functionSuggestions = [
        { label: 'floor(x)', detail: 'function', insertText: 'floor()', cursorOffset: -1 },
        { label: 'min(a, b)', detail: 'function', insertText: 'min(, )', cursorOffset: -3 },
        { label: 'max(a, b)', detail: 'function', insertText: 'max(, )', cursorOffset: -3 },
        { label: 'dice(count, sides)', detail: 'function', insertText: 'dice(1,20)', cursorOffset: 0 },
        { label: 'abs(x)', detail: 'function', insertText: 'abs()', cursorOffset: -1 },
        { label: 'ceil(x)', detail: 'function', insertText: 'ceil()', cursorOffset: -1 },
        { label: 'round(x)', detail: 'function', insertText: 'round()', cursorOffset: -1 },
    ];

    const legacyResourceMap = buildLegacyResourceMap(payload.resources);
    const tabs = normalizeTabs(payload.tabs, legacyResourceMap);
    if (tabs.length === 0) {
        tabs.push(createDefaultTab('Tab 1', 0));
    }

    const state = {
        settings: payload.settings ?? {},
        tabs,
        formulas: normalizeFormulas(payload.formulas),
        meta: payload.meta ?? {},
    };

    const formulaValidationById = new Map();

    let activeTabId = state.tabs[0]?.id ?? null;
    let dragState = null;

    const autocomplete = {
        element: null,
        input: null,
        formulaId: null,
        context: null,
        items: [],
        activeIndex: 0,
    };

    const fields = {};
    document.querySelectorAll('[data-workshop-field]').forEach((field) => {
        fields[field.dataset.workshopField] = field;
    });

    if (editable) {
        initAutocomplete();
    }

    function createExpressionParser() {
        const exprParser = new Parser({
            operators: {
                assignment: false,
            },
        });
        exprParser.functions.dice = (count, sides) => {
            const safeCount = Math.max(0, Math.floor(Number(count)) || 0);
            const safeSides = Math.max(1, Math.floor(Number(sides)) || 1);
            return safeCount > 0 && safeSides > 0 ? 1 : 0;
        };
        return exprParser;
    }

    function normalizeTabs(list, legacyMap) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((tab, index) => {
            const safe = isPlainObject(tab) ? tab : {};
            if (!isNonEmptyString(safe.id)) {
                safe.id = createId('tab');
            }
            if (!isNonEmptyString(safe.name)) {
                safe.name = `Tab ${index + 1}`;
            }
            safe.order = Number.isInteger(safe.order) ? safe.order : index;
            safe.resources = Array.isArray(safe.resources) ? safe.resources : [];

            if (safe.resources.length === 0 && Array.isArray(safe.elements)) {
                safe.resources = safe.elements.map((element, elementIndex) => {
                    const legacy = legacyMap[element.resourceId] ?? {};
                    return normalizeResource(
                        {
                            id: element.id ?? createId('res'),
                            name: legacy.name ?? `Resource ${elementIndex + 1}`,
                            type: legacy.type ?? 'text',
                            position: { column: 0, order: elementIndex },
                        },
                        elementIndex
                    );
                });
            } else {
                safe.resources = safe.resources.map((resource, resourceIndex) => normalizeResource(resource, resourceIndex));
            }

            if (safe.elements) {
                delete safe.elements;
            }

            return safe;
        });
    }

    function normalizeResource(resource, resourceIndex) {
        const safe = isPlainObject(resource) ? resource : {};
        if (!isNonEmptyString(safe.id)) {
            safe.id = createId('res');
        }
        if (!isNonEmptyString(safe.name)) {
            safe.name = 'Resource';
        }
        if (!isNonEmptyString(safe.type)) {
            safe.type = 'text';
        }

        const position = isPlainObject(safe.position) ? safe.position : {};
        const column = position.column === 1 ? 1 : 0;
        const order = isNumeric(position.order) ? Number(position.order) : resourceIndex;
        safe.position = { column, order };
        return safe;
    }

    function normalizeFormulas(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((formula, index) => {
            const safe = isPlainObject(formula) ? { ...formula } : {};
            if (!isNonEmptyString(safe.id)) {
                safe.id = createId('formula');
            }
            safe.name = isNonEmptyString(safe.name) ? safe.name : `Formula ${index + 1}`;
            safe.expression = typeof safe.expression === 'string' ? safe.expression : '';
            return safe;
        });
    }

    function isPlainObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    function isNumeric(value) {
        return value !== null && value !== '' && !Number.isNaN(Number(value));
    }

    function createId(prefix) {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }
        return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeVariableName(value) {
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '') || 'var';
    }

    function normalizeExpressionForParser(expression) {
        const withTokens = String(expression).replace(/\|([^|]+)\|/g, (_, name) => normalizeVariableName(name));
        return withTokens.replace(/\b(\d+)?\s*d\s*(\d+)\b/gi, (_, count, sides) => {
            const safeCount = count ? Number(count) : 1;
            return `dice(${safeCount},${Number(sides)})`;
        });
    }

    function buildLegacyResourceMap(list) {
        const map = {};
        if (!Array.isArray(list)) {
            return map;
        }

        list.forEach((resource) => {
            if (!isPlainObject(resource) || !isNonEmptyString(resource.id)) {
                return;
            }
            map[resource.id] = {
                name: isNonEmptyString(resource.name) ? resource.name : 'Resource',
                type: isNonEmptyString(resource.type) ? resource.type : 'text',
            };
        });

        return map;
    }

    function createDefaultTab(name, order) {
        return {
            id: createId('tab'),
            name: name ?? 'Tab',
            order: Number.isInteger(order) ? order : 0,
            resources: [],
        };
    }

    function getActiveTab() {
        return state.tabs.find((tab) => tab.id === activeTabId) ?? null;
    }

    function setActiveTab(tabId) {
        activeTabId = tabId;
        renderTabsBar();
        renderTabPanel();
    }

    function syncFields() {
        if (fields.settings) {
            fields.settings.value = JSON.stringify(state.settings ?? {});
        }
        if (fields.resources) {
            fields.resources.value = JSON.stringify(flattenResources(state.tabs));
        }
        if (fields.tabs) {
            fields.tabs.value = JSON.stringify(state.tabs ?? []);
        }
        if (fields.formulas) {
            fields.formulas.value = JSON.stringify(state.formulas ?? []);
        }
        if (fields.meta) {
            fields.meta.value = JSON.stringify(state.meta ?? {});
        }
    }

    function render() {
        validateFormulas();
        renderTabsBar();
        renderTabPanel();
        renderFormulasPanel();
        updateValidationUI();
        syncFields();
    }

    function renderTabsBar() {
        const tabsBar = root.querySelector('[data-tabs-bar]');
        if (!tabsBar) {
            return;
        }

        tabsBar.innerHTML = '';
        if (state.tabs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No tabs yet.';
            tabsBar.appendChild(empty);
            return;
        }

        state.tabs.forEach((tab) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `workshop-tab-btn${tab.id === activeTabId ? ' active' : ''}`;
            btn.dataset.action = 'select-tab';
            btn.dataset.tabId = tab.id;
            btn.textContent = tab.name;
            tabsBar.appendChild(btn);
        });
    }

    function renderTabPanel() {
        const panel = root.querySelector('[data-tab-panel]');
        if (!panel) {
            return;
        }

        panel.innerHTML = '';
        const tab = getActiveTab();
        if (!tab) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'Select a tab to edit its resources.';
            panel.appendChild(empty);
            return;
        }

        const header = document.createElement('div');
        header.className = 'workshop-tab-header';

        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Tab name';
        titleLabel.className = 'workshop-label';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = tab.name;
        titleInput.dataset.field = 'tab-name';
        titleInput.dataset.tabId = tab.id;
        if (!editable) {
            titleInput.disabled = true;
        }

        header.appendChild(titleLabel);
        header.appendChild(titleInput);

        if (editable) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'workshop-inline-btn';
            removeBtn.dataset.action = 'remove-tab';
            removeBtn.dataset.tabId = tab.id;
            removeBtn.textContent = 'Remove tab';
            header.appendChild(removeBtn);
        }

        panel.appendChild(header);

        const columnsWrapper = document.createElement('div');
        columnsWrapper.className = 'workshop-columns';

        [0, 1].forEach((column) => {
            const columnEl = document.createElement('div');
            columnEl.className = 'workshop-column';
            columnEl.dataset.column = String(column);
            columnEl.dataset.tabId = tab.id;

            const columnTitle = document.createElement('div');
            columnTitle.className = 'workshop-column-title';
            columnTitle.textContent = column === 0 ? 'Column A' : 'Column B';

            const list = document.createElement('div');
            list.className = 'workshop-column-list';
            list.dataset.columnList = String(column);

            const resources = getColumnResources(tab, column);
            if (resources.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'workshop-empty';
                empty.textContent = 'Drop resources here.';
                list.appendChild(empty);
            } else {
                resources.forEach((resource) => {
                    const card = document.createElement('div');
                    card.className = 'workshop-resource-card';
                    card.dataset.resourceId = resource.id;
                    card.dataset.tabId = tab.id;
                    if (editable) {
                        card.setAttribute('draggable', 'true');
                    }

                    const nameInput = document.createElement('input');
                    nameInput.type = 'text';
                    nameInput.value = resource.name;
                    nameInput.dataset.field = 'resource-name';
                    nameInput.dataset.resourceId = resource.id;
                    nameInput.dataset.tabId = tab.id;
                    if (!editable) {
                        nameInput.disabled = true;
                    }

                    const typeSelect = document.createElement('select');
                    typeSelect.dataset.field = 'resource-type';
                    typeSelect.dataset.resourceId = resource.id;
                    typeSelect.dataset.tabId = tab.id;
                    if (!editable) {
                        typeSelect.disabled = true;
                    }

                    ['text', 'number', 'boolean', 'select'].forEach((type) => {
                        const option = document.createElement('option');
                        option.value = type;
                        option.textContent = type;
                        if (resource.type === type) {
                            option.selected = true;
                        }
                        typeSelect.appendChild(option);
                    });

                    card.appendChild(nameInput);
                    card.appendChild(typeSelect);

                    if (editable) {
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'workshop-inline-btn';
                        removeBtn.dataset.action = 'remove-resource';
                        removeBtn.dataset.resourceId = resource.id;
                        removeBtn.dataset.tabId = tab.id;
                        removeBtn.textContent = 'Remove';
                        card.appendChild(removeBtn);
                    }

                    list.appendChild(card);
                });
            }

            columnEl.appendChild(columnTitle);
            columnEl.appendChild(list);
            columnsWrapper.appendChild(columnEl);
        });

        panel.appendChild(columnsWrapper);
    }

    function renderFormulasPanel() {
        const panel = root.querySelector('[data-formulas-list]');
        if (!panel) {
            return;
        }

        panel.innerHTML = '';
        if (state.formulas.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No formulas yet.';
            panel.appendChild(empty);
            return;
        }

        state.formulas.forEach((formula) => {
            const row = document.createElement('div');
            row.className = 'workshop-formula-row';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = formula.name;
            nameInput.placeholder = 'Formula name';
            nameInput.dataset.field = 'formula-name';
            nameInput.dataset.formulaId = formula.id;
            if (!editable) {
                nameInput.disabled = true;
            }

            const expressionWrap = document.createElement('div');
            expressionWrap.className = 'workshop-formula-expression';

            const expressionInput = document.createElement('input');
            expressionInput.type = 'text';
            expressionInput.value = formula.expression;
            expressionInput.placeholder = 'Expression, ex: (|agility|-10) / 2';
            expressionInput.dataset.field = 'formula-expression';
            expressionInput.dataset.formulaId = formula.id;
            if (!editable) {
                expressionInput.disabled = true;
            }

            const status = document.createElement('div');
            status.className = 'workshop-formula-status';
            status.dataset.formulaStatus = formula.id;

            expressionWrap.appendChild(expressionInput);
            expressionWrap.appendChild(status);

            row.appendChild(nameInput);
            row.appendChild(expressionWrap);

            if (editable) {
                const suggestBtn = document.createElement('button');
                suggestBtn.type = 'button';
                suggestBtn.className = 'workshop-inline-btn';
                suggestBtn.dataset.action = 'open-autocomplete';
                suggestBtn.dataset.formulaId = formula.id;
                suggestBtn.textContent = 'Insert';
                row.appendChild(suggestBtn);

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'workshop-inline-btn';
                removeBtn.dataset.action = 'remove-formula';
                removeBtn.dataset.formulaId = formula.id;
                removeBtn.textContent = 'Remove';
                row.appendChild(removeBtn);
            }

            panel.appendChild(row);
        });
    }

    function validateFormulas() {
        formulaValidationById.clear();

        const resources = getAllResources();
        const resourceKeys = new Set(resources.map((resource) => resource.key));

        const entries = state.formulas.map((formula, index) => ({
            id: formula.id,
            key: normalizeVariableName(formula.name || `formula_${index + 1}`),
            expression: formula.expression ?? '',
        }));

        const allFormulaKeys = new Set(entries.map((entry) => entry.key));
        const counts = new Map();
        entries.forEach((entry) => {
            counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
        });

        const depsByKey = new Map();
        const keyToIds = new Map();

        entries.forEach((entry) => {
            const errors = [];
            keyToIds.set(entry.key, [...(keyToIds.get(entry.key) ?? []), entry.id]);

            if ((counts.get(entry.key) ?? 0) > 1) {
                errors.push(`Duplicate formula key: ${entry.key}`);
            }

            const expression = entry.expression.trim();
            if (expression === '') {
                errors.push('Expression is required.');
                depsByKey.set(entry.key, []);
                formulaValidationById.set(entry.id, { status: 'invalid', message: errors[0] });
                return;
            }

            try {
                const normalized = normalizeExpressionForParser(expression);
                const parsed = parser.parse(normalized);
                const variables = parsed.variables().map((item) => normalizeVariableName(item));
                const unknown = Array.from(new Set(variables.filter((name) => {
                    return !resourceKeys.has(name) && !allFormulaKeys.has(name);
                })));

                if (unknown.length > 0) {
                    errors.push(`Unknown references: ${unknown.join(', ')}`);
                }

                const formulaDeps = Array.from(new Set(variables.filter((name) => {
                    return allFormulaKeys.has(name) && name !== entry.key;
                })));
                depsByKey.set(entry.key, formulaDeps);
            } catch (error) {
                depsByKey.set(entry.key, []);
                errors.push(`Parse error: ${error.message}`);
            }

            formulaValidationById.set(entry.id, {
                status: errors.length === 0 ? 'valid' : 'invalid',
                message: errors.length === 0 ? 'Valid expression.' : errors[0],
            });
        });

        const cycleKeys = detectCycleKeys(depsByKey);
        cycleKeys.forEach((cycleKey) => {
            (keyToIds.get(cycleKey) ?? []).forEach((formulaId) => {
                formulaValidationById.set(formulaId, {
                    status: 'invalid',
                    message: 'Circular dependency detected.',
                });
            });
        });
    }

    function detectCycleKeys(depsByKey) {
        const inDegree = new Map();
        const dependentsByKey = new Map();

        depsByKey.forEach((deps, key) => {
            inDegree.set(key, deps.length);
            deps.forEach((dep) => {
                if (!dependentsByKey.has(dep)) {
                    dependentsByKey.set(dep, []);
                }
                dependentsByKey.get(dep).push(key);
            });
        });

        const queue = [];
        inDegree.forEach((count, key) => {
            if (count === 0) {
                queue.push(key);
            }
        });

        while (queue.length > 0) {
            const key = queue.shift();
            const dependents = dependentsByKey.get(key) ?? [];
            dependents.forEach((dependent) => {
                const next = (inDegree.get(dependent) ?? 0) - 1;
                inDegree.set(dependent, next);
                if (next === 0) {
                    queue.push(dependent);
                }
            });
        }

        const cycleKeys = [];
        inDegree.forEach((count, key) => {
            if (count > 0) {
                cycleKeys.push(key);
            }
        });

        return cycleKeys;
    }

    function updateValidationUI() {
        root.querySelectorAll('[data-formula-status]').forEach((node) => {
            const formulaId = node.dataset.formulaStatus;
            const validation = formulaValidationById.get(formulaId) ?? {
                status: 'invalid',
                message: 'Expression is required.',
            };
            node.className = `workshop-formula-status ${validation.status === 'valid' ? 'is-valid' : 'is-invalid'}`;
            node.textContent = validation.message;
        });
    }

    function flattenResources(tabs) {
        const list = [];
        tabs.forEach((tab) => {
            const resources = Array.isArray(tab.resources) ? tab.resources : [];
            resources.forEach((resource) => {
                list.push({
                    id: resource.id,
                    name: resource.name,
                    type: resource.type,
                    tabId: tab.id,
                    column: resource.position?.column ?? 0,
                    order: resource.position?.order ?? 0,
                });
            });
        });
        return list;
    }

    function getColumnResources(tab, column) {
        return (tab.resources ?? [])
            .filter((resource) => (resource.position?.column ?? 0) === column)
            .sort((a, b) => (a.position?.order ?? 0) - (b.position?.order ?? 0));
    }

    function removeResourceFromTab(tab, resourceId) {
        const index = tab.resources.findIndex((resource) => resource.id === resourceId);
        if (index === -1) {
            return null;
        }
        return tab.resources.splice(index, 1)[0];
    }

    function replaceColumnResources(tab, column, columnResources) {
        const others = (tab.resources ?? []).filter((resource) => (resource.position?.column ?? 0) !== column);
        tab.resources = others.concat(columnResources);
    }

    function reindexColumn(tab, column) {
        const columnResources = getColumnResources(tab, column);
        columnResources.forEach((resource, index) => {
            resource.position = resource.position ?? {};
            resource.position.column = column;
            resource.position.order = index;
        });
        replaceColumnResources(tab, column, columnResources);
    }

    function moveResource({ fromTabId, resourceId, toTabId, toColumn, beforeResourceId }) {
        const fromTab = state.tabs.find((tab) => tab.id === fromTabId);
        const toTab = state.tabs.find((tab) => tab.id === toTabId);
        if (!fromTab || !toTab) {
            return;
        }

        const resource = removeResourceFromTab(fromTab, resourceId);
        if (!resource) {
            return;
        }

        const fromColumn = resource.position?.column ?? 0;
        const sameColumn = fromTabId === toTabId && fromColumn === toColumn;

        const targetColumnResources = getColumnResources(toTab, toColumn);
        let insertIndex = beforeResourceId
            ? targetColumnResources.findIndex((item) => item.id === beforeResourceId)
            : targetColumnResources.length;
        if (insertIndex < 0) {
            insertIndex = targetColumnResources.length;
        }

        resource.position = resource.position ?? {};
        resource.position.column = toColumn;
        targetColumnResources.splice(insertIndex, 0, resource);
        targetColumnResources.forEach((item, index) => {
            item.position.column = toColumn;
            item.position.order = index;
        });
        replaceColumnResources(toTab, toColumn, targetColumnResources);

        if (!sameColumn) {
            reindexColumn(fromTab, fromColumn);
        }
    }

    function getAllResources() {
        const unique = new Map();
        state.tabs.forEach((tab) => {
            (tab.resources ?? []).forEach((resource) => {
                const key = normalizeVariableName(resource.name);
                if (!unique.has(key)) {
                    unique.set(key, {
                        name: resource.name,
                        key,
                    });
                }
            });
        });
        return [...unique.values()];
    }

    function getFormulaReferenceItems(currentFormulaId) {
        return state.formulas
            .filter((formula) => formula.id !== currentFormulaId)
            .map((formula, index) => {
                const key = normalizeVariableName(formula.name || `formula_${index + 1}`);
                return {
                    kind: 'formula',
                    label: formula.name || key,
                    detail: key,
                    insertText: key,
                    cursorOffset: 0,
                };
            });
    }

    function initAutocomplete() {
        const el = document.createElement('div');
        el.className = 'workshop-autocomplete is-hidden';
        el.addEventListener('mousedown', (event) => {
            const itemEl = event.target.closest('[data-autocomplete-index]');
            if (!itemEl) {
                return;
            }
            event.preventDefault();
            const index = Number(itemEl.dataset.autocompleteIndex);
            selectAutocompleteItem(index);
        });
        document.body.appendChild(el);
        autocomplete.element = el;
    }

    function openAutocomplete(input, formulaId, force = false) {
        if (!editable || !autocomplete.element) {
            return;
        }

        const context = getAutocompleteContext(input, force);
        if (!context) {
            hideAutocomplete();
            return;
        }

        const items = buildAutocompleteItems(formulaId, context);
        if (items.length === 0) {
            hideAutocomplete();
            return;
        }

        autocomplete.input = input;
        autocomplete.formulaId = formulaId;
        autocomplete.context = context;
        autocomplete.items = items;
        autocomplete.activeIndex = 0;

        renderAutocomplete();
        positionAutocomplete();
    }

    function hideAutocomplete() {
        if (!autocomplete.element) {
            return;
        }
        autocomplete.element.classList.add('is-hidden');
        autocomplete.input = null;
        autocomplete.formulaId = null;
        autocomplete.context = null;
        autocomplete.items = [];
        autocomplete.activeIndex = 0;
    }

    function getAutocompleteContext(input, force = false) {
        const value = input.value;
        const cursor = input.selectionStart ?? value.length;

        const tokenStart = value.lastIndexOf('|', cursor - 1);
        if (tokenStart !== -1) {
            const tokenEnd = value.indexOf('|', tokenStart + 1);
            if (tokenEnd === -1 || tokenEnd >= cursor) {
                return {
                    mode: 'resource_token',
                    query: value.slice(tokenStart + 1, cursor),
                    start: tokenStart,
                    end: cursor,
                };
            }
        }

        let start = cursor;
        while (start > 0 && /[a-zA-Z0-9_]/.test(value[start - 1])) {
            start -= 1;
        }
        const query = value.slice(start, cursor);

        if (!force && query.length === 0) {
            return null;
        }

        return {
            mode: 'general',
            query,
            start,
            end: cursor,
        };
    }

    function buildAutocompleteItems(formulaId, context) {
        const query = context.query.toLowerCase();
        const resources = getAllResources().map((resource) => ({
            kind: 'resource',
            label: resource.name,
            detail: resource.key,
            insertText: `|${resource.key}|`,
            cursorOffset: 0,
        }));

        let items = [];
        if (context.mode === 'resource_token') {
            items = resources;
        } else {
            items = [
                ...functionSuggestions.map((item) => ({ kind: 'function', ...item })),
                ...getFormulaReferenceItems(formulaId),
                ...resources,
            ];
        }

        const filtered = items.filter((item) => {
            if (query === '') {
                return true;
            }
            return item.label.toLowerCase().includes(query) || item.detail.toLowerCase().includes(query);
        });

        return filtered.slice(0, 12);
    }

    function renderAutocomplete() {
        if (!autocomplete.element) {
            return;
        }

        autocomplete.element.innerHTML = '';
        autocomplete.items.forEach((item, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = `workshop-autocomplete-item${index === autocomplete.activeIndex ? ' is-active' : ''}`;
            option.dataset.autocompleteIndex = String(index);
            option.innerHTML = `<span>${item.label}</span><small>${item.detail}</small>`;
            autocomplete.element.appendChild(option);
        });

        autocomplete.element.classList.remove('is-hidden');
    }

    function positionAutocomplete() {
        if (!autocomplete.element || !autocomplete.input) {
            return;
        }

        const rect = autocomplete.input.getBoundingClientRect();
        autocomplete.element.style.left = `${rect.left + window.scrollX}px`;
        autocomplete.element.style.top = `${rect.bottom + window.scrollY + 4}px`;
        autocomplete.element.style.width = `${Math.max(260, rect.width)}px`;
    }

    function moveAutocompleteSelection(step) {
        if (!autocomplete.items.length) {
            return;
        }
        const size = autocomplete.items.length;
        autocomplete.activeIndex = (autocomplete.activeIndex + step + size) % size;
        renderAutocomplete();
        positionAutocomplete();
    }

    function selectAutocompleteItem(index = autocomplete.activeIndex) {
        const item = autocomplete.items[index];
        const input = autocomplete.input;
        const context = autocomplete.context;

        if (!item || !input || !context) {
            hideAutocomplete();
            return;
        }

        const before = input.value.slice(0, context.start);
        const after = input.value.slice(context.end);
        input.value = `${before}${item.insertText}${after}`;

        const cursor = context.start + item.insertText.length + item.cursorOffset;
        input.setSelectionRange(cursor, cursor);
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));

        hideAutocomplete();
    }

    function onFormulaExpressionInput(input) {
        const formulaId = input.dataset.formulaId;
        openAutocomplete(input, formulaId, false);
    }

    function onFormulaExpressionKeydown(event) {
        if (!editable || !event.target.matches('input[data-field="formula-expression"]')) {
            return;
        }

        if (event.ctrlKey && event.code === 'Space') {
            openAutocomplete(event.target, event.target.dataset.formulaId, true);
            event.preventDefault();
            return;
        }

        if (autocomplete.element?.classList.contains('is-hidden')) {
            return;
        }

        if (event.key === 'ArrowDown') {
            moveAutocompleteSelection(1);
            event.preventDefault();
            return;
        }

        if (event.key === 'ArrowUp') {
            moveAutocompleteSelection(-1);
            event.preventDefault();
            return;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
            selectAutocompleteItem();
            event.preventDefault();
            return;
        }

        if (event.key === 'Escape') {
            hideAutocomplete();
            event.preventDefault();
        }
    }

    function handleFieldInput(event) {
        if (!editable) {
            return;
        }

        const field = event.target.dataset.field;
        if (!field) {
            return;
        }

        if (field === 'tab-name') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            if (tab) {
                tab.name = event.target.value;
                const tabButton = root.querySelector(`[data-action="select-tab"][data-tab-id="${tab.id}"]`);
                if (tabButton) {
                    tabButton.textContent = tab.name || 'Tab';
                }
            }
            validateFormulas();
            updateValidationUI();
            syncFields();
            return;
        }

        if (field === 'resource-name') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            const resource = tab?.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                resource.name = event.target.value;
            }
            validateFormulas();
            updateValidationUI();
            syncFields();
            return;
        }

        if (field === 'resource-type') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            const resource = tab?.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                resource.type = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'formula-name') {
            const formula = state.formulas.find((item) => item.id === event.target.dataset.formulaId);
            if (formula) {
                formula.name = event.target.value;
            }
            validateFormulas();
            updateValidationUI();
            syncFields();
            return;
        }

        if (field === 'formula-expression') {
            const formula = state.formulas.find((item) => item.id === event.target.dataset.formulaId);
            if (formula) {
                formula.expression = event.target.value;
            }
            validateFormulas();
            updateValidationUI();
            syncFields();
            onFormulaExpressionInput(event.target);
        }
    }

    root.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) {
            return;
        }

        const action = actionEl.dataset.action;
        if (!editable && action !== 'select-tab') {
            return;
        }

        if (action === 'select-tab') {
            setActiveTab(actionEl.dataset.tabId);
            return;
        }

        if (action === 'add-tab') {
            const tab = createDefaultTab(`Tab ${state.tabs.length + 1}`, state.tabs.length);
            state.tabs.push(tab);
            setActiveTab(tab.id);
            render();
            return;
        }

        if (action === 'remove-tab') {
            if (state.tabs.length <= 1) {
                alert('At least one tab is required.');
                return;
            }
            const tabId = actionEl.dataset.tabId;
            state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
            if (activeTabId === tabId) {
                activeTabId = state.tabs[0]?.id ?? null;
            }
            render();
            return;
        }

        if (action === 'add-resource') {
            if (state.tabs.length === 0) {
                const tab = createDefaultTab('Tab 1', 0);
                state.tabs.push(tab);
                activeTabId = tab.id;
            }

            const tab = getActiveTab() ?? state.tabs[0];
            const column = getColumnResources(tab, 0).length <= getColumnResources(tab, 1).length ? 0 : 1;
            const order = getColumnResources(tab, column).length;
            tab.resources.push({
                id: createId('res'),
                name: `Resource ${tab.resources.length + 1}`,
                type: 'text',
                position: { column, order },
            });
            render();
            return;
        }

        if (action === 'remove-resource') {
            const tabId = actionEl.dataset.tabId;
            const resourceId = actionEl.dataset.resourceId;
            const tab = state.tabs.find((item) => item.id === tabId);
            if (tab) {
                const removed = removeResourceFromTab(tab, resourceId);
                if (removed) {
                    reindexColumn(tab, removed.position?.column ?? 0);
                }
            }
            render();
            return;
        }

        if (action === 'add-formula') {
            state.formulas.push({
                id: createId('formula'),
                name: `Formula ${state.formulas.length + 1}`,
                expression: '',
            });
            render();
            return;
        }

        if (action === 'remove-formula') {
            const formulaId = actionEl.dataset.formulaId;
            state.formulas = state.formulas.filter((formula) => formula.id !== formulaId);
            render();
            return;
        }

        if (action === 'open-autocomplete') {
            const formulaId = actionEl.dataset.formulaId;
            const input = root.querySelector(`input[data-field="formula-expression"][data-formula-id="${formulaId}"]`);
            if (input) {
                input.focus();
                openAutocomplete(input, formulaId, true);
            }
        }
    });

    root.addEventListener('input', handleFieldInput);
    root.addEventListener('change', handleFieldInput);
    root.addEventListener('keydown', onFormulaExpressionKeydown);

    root.addEventListener('focusin', (event) => {
        if (!editable || !event.target.matches('input[data-field="formula-expression"]')) {
            return;
        }
        validateFormulas();
        updateValidationUI();
    });

    root.addEventListener('dragstart', (event) => {
        if (!editable) {
            return;
        }
        const card = event.target.closest('.workshop-resource-card');
        if (!card) {
            return;
        }
        dragState = {
            resourceId: card.dataset.resourceId,
            tabId: card.dataset.tabId,
        };
        card.classList.add('is-dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    });

    root.addEventListener('dragend', (event) => {
        const card = event.target.closest('.workshop-resource-card');
        if (card) {
            card.classList.remove('is-dragging');
        }
        dragState = null;
    });

    root.addEventListener('dragover', (event) => {
        if (!editable || !dragState) {
            return;
        }
        const column = event.target.closest('[data-column]');
        const card = event.target.closest('.workshop-resource-card');
        if (!column && !card) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    });

    root.addEventListener('drop', (event) => {
        if (!editable || !dragState) {
            return;
        }
        const card = event.target.closest('.workshop-resource-card');
        const columnEl = event.target.closest('[data-column]');
        if (!columnEl && !card) {
            return;
        }
        event.preventDefault();

        const targetColumn = Number((columnEl ?? card.closest('[data-column]'))?.dataset.column ?? 0);
        const targetTabId = (columnEl ?? card).closest('[data-column]')?.dataset.tabId;
        if (!targetTabId) {
            return;
        }

        moveResource({
            fromTabId: dragState.tabId,
            resourceId: dragState.resourceId,
            toTabId: targetTabId,
            toColumn: targetColumn,
            beforeResourceId: card?.dataset.resourceId ?? null,
        });

        render();
    });

    document.addEventListener('click', (event) => {
        if (!editable || !autocomplete.element) {
            return;
        }
        const target = event.target;
        if (autocomplete.element.contains(target)) {
            return;
        }
        if (target.closest('input[data-field="formula-expression"]')) {
            return;
        }
        if (target.closest('[data-action="open-autocomplete"]')) {
            return;
        }
        hideAutocomplete();
    });

    window.addEventListener('resize', () => {
        if (!autocomplete.element || autocomplete.element.classList.contains('is-hidden')) {
            return;
        }
        positionAutocomplete();
    });

    render();
}
