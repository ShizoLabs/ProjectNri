const root = document.querySelector('[data-workshop-builder]');

if (root) {
    const editable = root.dataset.editable === 'true';
    const payload = window.WORKSHOP_SYSTEM ?? {};

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

    let activeTabId = state.tabs[0]?.id ?? null;
    let dragState = null;

    const fields = {};
    document.querySelectorAll('[data-workshop-field]').forEach((field) => {
        fields[field.dataset.workshopField] = field;
    });

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
        renderTabsBar();
        renderTabPanel();
        renderFormulasPanel();
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

        const resources = getAllResources();

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

            const expressionInput = document.createElement('input');
            expressionInput.type = 'text';
            expressionInput.value = formula.expression;
            expressionInput.placeholder = 'Expression';
            expressionInput.dataset.field = 'formula-expression';
            expressionInput.dataset.formulaId = formula.id;
            if (!editable) {
                expressionInput.disabled = true;
            }

            const resourceSelect = document.createElement('select');
            resourceSelect.dataset.action = 'insert-resource';
            resourceSelect.dataset.formulaId = formula.id;
            if (!editable) {
                resourceSelect.disabled = true;
            }

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = resources.length > 0 ? 'Insert resource' : 'No resources';
            placeholder.selected = true;
            resourceSelect.appendChild(placeholder);

            resources.forEach((resource) => {
                const option = document.createElement('option');
                option.value = resource.key;
                option.textContent = resource.name;
                resourceSelect.appendChild(option);
            });

            row.appendChild(nameInput);
            row.appendChild(expressionInput);
            row.appendChild(resourceSelect);

            if (editable) {
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
            const resource = {
                id: createId('res'),
                name: `Resource ${tab.resources.length + 1}`,
                type: 'text',
                position: { column, order },
            };
            tab.resources.push(resource);
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
    });

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
            syncFields();
            return;
        }

        if (field === 'resource-name') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            const resource = tab?.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                resource.name = event.target.value;
            }
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
            syncFields();
            return;
        }

        if (field === 'formula-expression') {
            const formula = state.formulas.find((item) => item.id === event.target.dataset.formulaId);
            if (formula) {
                formula.expression = event.target.value;
            }
            syncFields();
        }
    }

    root.addEventListener('input', handleFieldInput);
    root.addEventListener('change', handleFieldInput);

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

    root.addEventListener('change', (event) => {
        const select = event.target.closest('[data-action=\"insert-resource\"]');
        if (!select || !editable) {
            return;
        }

        const formulaId = select.dataset.formulaId;
        const key = select.value;
        if (!key) {
            return;
        }

        const formula = state.formulas.find((item) => item.id === formulaId);
        const input = root.querySelector(`input[data-field=\"formula-expression\"][data-formula-id=\"${formulaId}\"]`);
        if (formula && input) {
            const token = `|${key}|`;
            insertAtCursor(input, token);
            formula.expression = input.value;
            syncFields();
        }

        select.value = '';
    });

    render();

    function getAllResources() {
        const list = [];
        state.tabs.forEach((tab) => {
            (tab.resources ?? []).forEach((resource) => {
                const key = normalizeVariableName(resource.name);
                list.push({ name: resource.name, key });
            });
        });
        return list;
    }

    function normalizeVariableName(value) {
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '') || 'var';
    }

    function insertAtCursor(input, text) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const before = input.value.slice(0, start);
        const after = input.value.slice(end);
        input.value = `${before}${text}${after}`;
        const cursor = start + text.length;
        input.setSelectionRange(cursor, cursor);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
