import { Parser } from 'https://cdn.jsdelivr.net/npm/expr-eval@2.0.2/dist/index.mjs';
import { computeAll } from './formulaEngine.js';

// Корневой узел конструктора системы.
const root = document.querySelector('[data-workshop-builder]');

if (root) {
    // Флаг режима редактирования. В режиме просмотра изменения отключены.
    const editable = root.dataset.editable === 'true';
    // Начальные данные системы, приходящие из Twig (window.WORKSHOP_SYSTEM).
    const payload = window.WORKSHOP_SYSTEM ?? {};

    // Локальный парсер выражений для валидации формул в реальном времени.
    const parser = createExpressionParser();
    // Набор подсказок по встроенным функциям, которые можно быстро вставлять в выражение.
    const functionSuggestions = [
        { label: 'floor(x)', detail: 'function', insertText: 'floor()', cursorOffset: -1 },
        { label: 'min(a, b)', detail: 'function', insertText: 'min(, )', cursorOffset: -3 },
        { label: 'max(a, b)', detail: 'function', insertText: 'max(, )', cursorOffset: -3 },
        { label: 'dice(count, sides)', detail: 'function', insertText: 'dice(1,20)', cursorOffset: 0 },
        { label: 'abs(x)', detail: 'function', insertText: 'abs()', cursorOffset: -1 },
        { label: 'ceil(x)', detail: 'function', insertText: 'ceil()', cursorOffset: -1 },
        { label: 'round(x)', detail: 'function', insertText: 'round()', cursorOffset: -1 },
    ];

    // Единое состояние конструктора, которое сериализуется в скрытые поля формы.
    const state = buildInitialState(payload);

    // Результаты валидации каждой формулы (по id).
    const formulaValidationById = new Map();
    // Результаты предпросмотра вычисления каждой формулы (по id).
    const formulaPreviewById = new Map();

    // Идентификатор активной вкладки и временное состояние drag-and-drop ресурсов.
    let activeTabId = state.tabs[0]?.id ?? null;
    let activeSheetTemplateId = state.sheetTemplates[0]?.id ?? null;
    let dragState = null;

    // Состояние всплывающего автокомплита формул.
    const autocomplete = {
        element: null,
        input: null,
        formulaId: null,
        context: null,
        items: [],
        activeIndex: 0,
    };

    // Ссылки на скрытые поля формы, в которые записывается JSON.
    const fields = {};
    document.querySelectorAll('[data-workshop-field]').forEach((field) => {
        fields[field.dataset.workshopField] = field;
    });

    // Автокомплит нужен только в режиме редактирования.
    if (editable) {
        initAutocomplete();
    }

    // Создание безопасного парсера выражений для клиентской проверки формул.
    function createExpressionParser() {
        const exprParser = new Parser({
            operators: {
                assignment: false,
            },
        });
        // Пользовательская функция dice(count, sides) для совместимости с RPG-нотацией.
        // Для проверки синтаксиса возвращаем детерминированное безопасное значение.
        exprParser.functions.dice = (count, sides) => {
            const safeCount = Math.max(0, Math.floor(Number(count)) || 0);
            const safeSides = Math.max(1, Math.floor(Number(sides)) || 1);
            return safeCount > 0 && safeSides > 0 ? 1 : 0;
        };
        return exprParser;
    }

    function buildInitialState(rawPayload) {
        const rawTabs = Array.isArray(rawPayload.tabs) ? rawPayload.tabs : [];
        const legacyResourceMap = buildLegacyResourceMap(rawPayload.resources);
        const tabs = normalizeTabs(rawTabs);

        if (tabs.length === 0) {
            tabs.push(createDefaultTab('Tab 1', 0));
        }

        const fallbackTabId = tabs[0]?.id ?? createId('tab');
        const resources = normalizeResources(rawPayload.resources, fallbackTabId);
        const abilities = normalizeAbilities(rawPayload.abilities, fallbackTabId);
        const formulas = normalizeFormulas(rawPayload.formulas);

        if (resources.length === 0) {
            resources.push(...extractResourcesFromTabs(rawTabs, legacyResourceMap));
        }
        if (abilities.length === 0) {
            abilities.push(...extractAbilitiesFromTabs(rawTabs));
        }
        if (formulas.length === 0) {
            formulas.push(...extractFormulasFromTabs(rawTabs));
        }

        ensureItemsUseKnownTabs(resources, tabs, fallbackTabId);
        ensureItemsUseKnownTabs(abilities, tabs, fallbackTabId);
        ensureFormulaTabs(formulas, tabs);
        reindexAllColumns(tabs, resources, abilities, formulas);

        return {
            settings: rawPayload.settings ?? {},
            tabs,
            resources,
            abilities,
            formulas,
            sheetTemplates: normalizeSheetTemplates(rawPayload.sheetTemplates),
            meta: rawPayload.meta ?? {},
        };
    }

    // Нормализация вкладок до метаданных; карточки хранятся отдельно по типам.
    function normalizeTabs(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((tab, index) => {
            const safe = isPlainObject(tab) ? tab : {};
            return {
                id: isNonEmptyString(safe.id) ? safe.id : createId('tab'),
                name: isNonEmptyString(safe.name) ? safe.name : `Tab ${index + 1}`,
                order: isNumeric(safe.order) ? Number(safe.order) : index,
            };
        });
    }

    // Нормализация плоского списка ресурсов.
    function normalizeResources(list, fallbackTabId) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((resource, index) => normalizeResource(resource, fallbackTabId, index));
    }

    // Нормализация одного ресурса с позицией внутри вкладки.
    function normalizeResource(resource, fallbackTabId, resourceIndex) {
        const safe = isPlainObject(resource) ? { ...resource } : {};
        const position = isPlainObject(safe.position) ? safe.position : {};

        return {
            id: isNonEmptyString(safe.id) ? safe.id : createId('res'),
            name: isNonEmptyString(safe.name) ? safe.name : 'Resource',
            type: isNonEmptyString(safe.type) ? safe.type : 'text',
            tabId: isNonEmptyString(safe.tabId) ? safe.tabId : fallbackTabId,
            column: safe.column === 1 || position.column === 1 ? 1 : 0,
            order: isNumeric(safe.order) ? Number(safe.order) : (isNumeric(position.order) ? Number(position.order) : resourceIndex),
        };
    }

    // Нормализация плоского списка способностей.
    function normalizeAbilities(list, fallbackTabId) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((ability, index) => normalizeAbility(ability, fallbackTabId, index));
    }

    // Нормализация способности с обязательными строковыми полями.
    function normalizeAbility(ability, fallbackTabId, abilityIndex) {
        const safe = isPlainObject(ability) ? { ...ability } : {};
        const position = isPlainObject(safe.position) ? safe.position : {};
        const type = ['active', 'passive', 'special'].includes(safe.type) ? safe.type : 'active';

        return {
            id: isNonEmptyString(safe.id) ? safe.id : createId('ability'),
            name: isNonEmptyString(safe.name) ? safe.name : `Ability ${abilityIndex + 1}`,
            description: typeof safe.description === 'string' ? safe.description : '',
            unlock_condition: typeof safe.unlock_condition === 'string' ? safe.unlock_condition : '',
            use_condition: typeof safe.use_condition === 'string' ? safe.use_condition : '',
            trigger_condition: typeof safe.trigger_condition === 'string' ? safe.trigger_condition : '',
            type,
            grants: typeof safe.grants === 'string' ? safe.grants : '',
            icon: typeof safe.icon === 'string' ? safe.icon : '',
            tabId: isNonEmptyString(safe.tabId) ? safe.tabId : fallbackTabId,
            column: safe.column === 1 || position.column === 1 ? 1 : 0,
            order: isNumeric(safe.order) ? Number(safe.order) : (isNumeric(position.order) ? Number(position.order) : abilityIndex),
        };
    }

    // Нормализация плоского списка формул.
    function normalizeFormulas(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((formula, index) => normalizeFormula(formula, null, index));
    }

    // Нормализация формулы: id, name, expression и позиция.
    function normalizeFormula(formula, fallbackTabId = null, formulaIndex = 0) {
        const safe = isPlainObject(formula) ? { ...formula } : {};
        const position = isPlainObject(safe.position) ? safe.position : {};

        return {
            id: isNonEmptyString(safe.id) ? safe.id : createId('formula'),
            name: isNonEmptyString(safe.name) ? safe.name : `Formula ${formulaIndex + 1}`,
            expression: typeof safe.expression === 'string' ? safe.expression : '',
            tabId: isNonEmptyString(safe.tabId) ? safe.tabId : fallbackTabId,
            column: safe.column === 1 || position.column === 1 ? 1 : 0,
            order: isNumeric(safe.order) ? Number(safe.order) : (isNumeric(position.order) ? Number(position.order) : formulaIndex),
        };
    }

    // Восстановление ресурсов из старой структуры tabs.resources/elements.
    function extractResourcesFromTabs(tabs, legacyMap) {
        if (!Array.isArray(tabs)) {
            return [];
        }

        const items = [];
        tabs.forEach((tab, tabIndex) => {
            const safeTab = isPlainObject(tab) ? tab : {};
            const tabId = isNonEmptyString(safeTab.id) ? safeTab.id : `legacy-tab-${tabIndex + 1}`;
            const nestedResources = Array.isArray(safeTab.resources) ? safeTab.resources : [];

            nestedResources.forEach((resource, resourceIndex) => {
                items.push(normalizeResource({ ...resource, tabId }, tabId, resourceIndex));
            });

            const legacyElements = Array.isArray(safeTab.elements) ? safeTab.elements : [];
            legacyElements.forEach((element, elementIndex) => {
                const safeElement = isPlainObject(element) ? element : {};
                const legacy = legacyMap[safeElement.resourceId] ?? {};
                items.push(normalizeResource(
                    {
                        id: safeElement.id ?? createId('res'),
                        name: legacy.name ?? `Resource ${elementIndex + 1}`,
                        type: legacy.type ?? 'text',
                        tabId,
                        position: { column: 0, order: elementIndex },
                    },
                    tabId,
                    elementIndex
                ));
            });
        });

        return items;
    }

    // Восстановление способностей из tabs.abilities, если корневой список ещё не существует.
    function extractAbilitiesFromTabs(tabs) {
        if (!Array.isArray(tabs)) {
            return [];
        }

        const items = [];
        tabs.forEach((tab, tabIndex) => {
            const safeTab = isPlainObject(tab) ? tab : {};
            const tabId = isNonEmptyString(safeTab.id) ? safeTab.id : `legacy-tab-${tabIndex + 1}`;
            const nestedAbilities = Array.isArray(safeTab.abilities) ? safeTab.abilities : [];

            nestedAbilities.forEach((ability, abilityIndex) => {
                items.push(normalizeAbility({ ...ability, tabId }, tabId, abilityIndex));
            });
        });

        return items;
    }

    // Восстановление формул из tabs.formulas, если корневой список ещё не существует.
    function extractFormulasFromTabs(tabs) {
        if (!Array.isArray(tabs)) {
            return [];
        }

        const items = [];
        tabs.forEach((tab, tabIndex) => {
            const safeTab = isPlainObject(tab) ? tab : {};
            const tabId = isNonEmptyString(safeTab.id) ? safeTab.id : `legacy-tab-${tabIndex + 1}`;
            const nestedFormulas = Array.isArray(safeTab.formulas) ? safeTab.formulas : [];

            nestedFormulas.forEach((formula, formulaIndex) => {
                items.push(normalizeFormula({ ...formula, tabId }, tabId, formulaIndex));
            });
        });

        return items;
    }

    // Нормализация шаблонов листов токена.
    function normalizeSheetTemplates(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((template, index) => {
            const safe = isPlainObject(template) ? { ...template } : {};
            if (!isNonEmptyString(safe.id)) {
                safe.id = createId('sheet-template');
            }

            const name = isNonEmptyString(safe.name) ? safe.name : `Template ${index + 1}`;
            const fields = (Array.isArray(safe.fields) ? safe.fields : [])
                .map((field, fieldIndex) => normalizeSheetTemplateField(field, fieldIndex))
                .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

            // Возвращаем только поддерживаемые ключи шаблона листа.
            return {
                id: safe.id,
                name,
                fields,
            };
        });
    }

    // Нормализация поля шаблона листа.
    function normalizeSheetTemplateField(field, fieldIndex) {
        const safe = isPlainObject(field) ? { ...field } : {};
        if (!isNonEmptyString(safe.id)) {
            safe.id = createId('sheet-field');
        }

        safe.label = isNonEmptyString(safe.label) ? safe.label : `Field ${fieldIndex + 1}`;
        safe.kind = ['resource', 'formula', 'local'].includes(safe.kind) ? safe.kind : 'local';
        safe.sourceKey = isNonEmptyString(safe.sourceKey) ? normalizeVariableName(safe.sourceKey) : normalizeVariableName(safe.label);
        safe.key = isNonEmptyString(safe.key) ? normalizeVariableName(safe.key) : safe.sourceKey;
        safe.inputType = ['text', 'number', 'boolean'].includes(safe.inputType) ? safe.inputType : 'text';
        safe.readOnly = Boolean(safe.readOnly) || safe.kind === 'formula';
        safe.order = isNumeric(safe.order) ? Number(safe.order) : fieldIndex;

        return safe;
    }

    // Вспомогательные проверки типов.
    function isPlainObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    function isNumeric(value) {
        return value !== null && value !== '' && !Number.isNaN(Number(value));
    }

    // Генератор уникального id для вкладок/ресурсов/формул.
    function createId(prefix) {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }
        return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    }

    // Нормализация имени в идентификатор переменной формулы.
    function normalizeVariableName(value) {
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '') || 'var';
    }

    // Подготовка выражения к парсингу:
    // 1) токены вида |resource| превращаются в безопасные ключи;
    // 2) RPG-нотация NdM превращается в dice(N, M).
    function normalizeExpressionForParser(expression) {
        const withTokens = String(expression).replace(/\|([^|]+)\|/g, (_, name) => normalizeVariableName(name));
        return withTokens.replace(/\b(\d+)?\s*d\s*(\d+)\b/gi, (_, count, sides) => {
            const safeCount = count ? Number(count) : 1;
            return `dice(${safeCount},${Number(sides)})`;
        });
    }

    // Сбор карты legacy-ресурсов по id, чтобы переносить старые элементы корректно.
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

    // Привязываем карточки к существующим вкладкам.
    function ensureItemsUseKnownTabs(items, tabs, fallbackTabId) {
        const knownTabIds = new Set(tabs.map((tab) => tab.id));

        items.forEach((item, index) => {
            if (!knownTabIds.has(item.tabId)) {
                item.tabId = fallbackTabId;
            }
            item.column = item.column === 1 ? 1 : 0;
            item.order = isNumeric(item.order) ? Number(item.order) : index;
        });
    }

    // Формулы старого формата переносим на отдельную вкладку Formulas.
    function ensureFormulaTabs(formulas, tabs) {
        if (!Array.isArray(formulas) || formulas.length === 0) {
            return;
        }

        const knownTabIds = new Set(tabs.map((tab) => tab.id));
        let formulaTab = tabs.find((tab) => normalizeVariableName(tab.name) === 'formulas') ?? null;

        formulas.forEach((formula, index) => {
            if (!knownTabIds.has(formula.tabId)) {
                if (!formulaTab) {
                    formulaTab = createDefaultTab('Formulas', tabs.length);
                    tabs.push(formulaTab);
                    knownTabIds.add(formulaTab.id);
                }
                formula.tabId = formulaTab.id;
            }

            formula.column = formula.column === 1 ? 1 : 0;
            formula.order = isNumeric(formula.order) ? Number(formula.order) : index;
        });
    }

    // Пересчитываем порядок карточек внутри каждой колонки вкладки.
    function reindexAllColumns(tabs, resources, abilities, formulas) {
        tabs.forEach((tab) => {
            [0, 1].forEach((column) => {
                const entries = getColumnItemsForLists(tab.id, column, resources, abilities, formulas);
                entries.forEach((entry, index) => {
                    entry.item.order = index;
                    entry.item.column = column;
                });
            });
        });
    }

    function getColumnItemsForLists(tabId, column, resources, abilities, formulas) {
        return [
            ...resources
                .filter((resource) => resource.tabId === tabId && resource.column === column)
                .map((resource) => ({ kind: 'resource', item: resource })),
            ...abilities
                .filter((ability) => ability.tabId === tabId && ability.column === column)
                .map((ability) => ({ kind: 'ability', item: ability })),
            ...formulas
                .filter((formula) => formula.tabId === tabId && formula.column === column)
                .map((formula) => ({ kind: 'formula', item: formula })),
        ].sort((left, right) => (left.item.order ?? 0) - (right.item.order ?? 0));
    }

    // Создание вкладки по умолчанию.
    function createDefaultTab(name, order) {
        return {
            id: createId('tab'),
            name: name ?? 'Tab',
            order: Number.isInteger(order) ? order : 0,
        };
    }

    // Текущая активная вкладка.
    function getActiveTab() {
        return state.tabs.find((tab) => tab.id === activeTabId) ?? null;
    }

    // Текущий активный шаблон листа токена.
    function getActiveSheetTemplate() {
        return state.sheetTemplates.find((template) => template.id === activeSheetTemplateId) ?? null;
    }

    // Переключение активной вкладки с перерисовкой UI вкладок.
    function setActiveTab(tabId) {
        activeTabId = tabId;
        validateFormulas();
        renderTabsBar();
        renderTabPanel();
        updateValidationUI();
        updatePreviewUI();
    }

    // Переключение активного шаблона листа.
    function setActiveSheetTemplate(templateId) {
        activeSheetTemplateId = templateId;
        renderSheetTemplatesPanel();
    }

    // Синхронизация состояния конструктора в скрытые поля формы (JSON).
    function syncFields() {
        if (fields.settings) {
            fields.settings.value = JSON.stringify(state.settings ?? {});
        }
        if (fields.resources) {
            fields.resources.value = JSON.stringify(state.resources ?? []);
        }
        if (fields.abilities) {
            fields.abilities.value = JSON.stringify(state.abilities ?? []);
        }
        if (fields.tabs) {
            fields.tabs.value = JSON.stringify(buildTabsPayload());
        }
        if (fields.formulas) {
            fields.formulas.value = JSON.stringify(state.formulas ?? []);
        }
        if (fields.sheetTemplates) {
            fields.sheetTemplates.value = JSON.stringify(state.sheetTemplates ?? []);
        }
        if (fields.meta) {
            fields.meta.value = JSON.stringify(state.meta ?? {});
        }
    }

    // Централизованный рендер интерфейса конструктора.
    function render() {
        validateFormulas();
        renderTabsBar();
        renderTabPanel();
        renderSheetTemplatesPanel();
        updateValidationUI();
        updatePreviewUI();
        syncFields();
    }

    // Рендер верхней панели вкладок.
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

    // Рендер содержимого активной вкладки и двух колонок ресурсов.
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
            empty.textContent = 'Select a tab to edit its cards.';
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

            const items = getColumnItems(tab.id, column);
            if (items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'workshop-empty';
                empty.textContent = 'Drop cards here.';
                list.appendChild(empty);
            } else {
                items.forEach((entry) => {
                    list.appendChild(createColumnCard(entry, tab.id));
                });
            }

            columnEl.appendChild(columnTitle);
            columnEl.appendChild(list);
            columnsWrapper.appendChild(columnEl);
        });

        panel.appendChild(columnsWrapper);
    }

    function createColumnCard(entry, tabId) {
        const card = document.createElement('div');
        card.className = `workshop-item-card is-${entry.kind}`;
        card.dataset.itemKind = entry.kind;
        card.dataset.itemId = entry.item.id;
        card.dataset.tabId = tabId;
        if (editable) {
            card.setAttribute('draggable', 'true');
        }

        const badge = document.createElement('div');
        badge.className = 'workshop-item-badge';
        badge.textContent = entry.kind;
        card.appendChild(badge);

        if (entry.kind === 'resource') {
            appendResourceCardFields(card, entry.item, tabId);
        } else if (entry.kind === 'ability') {
            appendAbilityCardFields(card, entry.item, tabId);
        } else {
            appendFormulaCardFields(card, entry.item);
        }

        return card;
    }

    function appendResourceCardFields(card, resource, tabId) {
        const row = document.createElement('div');
        row.className = 'workshop-item-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = resource.name;
        nameInput.dataset.field = 'resource-name';
        nameInput.dataset.resourceId = resource.id;
        nameInput.dataset.tabId = tabId;
        if (!editable) {
            nameInput.disabled = true;
        }

        const typeSelect = document.createElement('select');
        typeSelect.dataset.field = 'resource-type';
        typeSelect.dataset.resourceId = resource.id;
        typeSelect.dataset.tabId = tabId;
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

        row.appendChild(nameInput);
        row.appendChild(typeSelect);

        if (editable) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'workshop-inline-btn';
            removeBtn.dataset.action = 'remove-resource';
            removeBtn.dataset.resourceId = resource.id;
            removeBtn.dataset.tabId = tabId;
            removeBtn.textContent = 'Remove';
            row.appendChild(removeBtn);
        }

        card.appendChild(row);
    }

    function appendAbilityCardFields(card, ability, tabId) {
        const topRow = document.createElement('div');
        topRow.className = 'workshop-item-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = ability.name;
        nameInput.dataset.field = 'ability-name';
        nameInput.dataset.abilityId = ability.id;
        nameInput.dataset.tabId = tabId;
        nameInput.placeholder = 'Ability name';
        if (!editable) {
            nameInput.disabled = true;
        }

        const typeSelect = document.createElement('select');
        typeSelect.dataset.field = 'ability-type';
        typeSelect.dataset.abilityId = ability.id;
        typeSelect.dataset.tabId = tabId;
        if (!editable) {
            typeSelect.disabled = true;
        }

        ['active', 'passive', 'special'].forEach((type) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (ability.type === type) {
                option.selected = true;
            }
            typeSelect.appendChild(option);
        });

        topRow.appendChild(nameInput);
        topRow.appendChild(typeSelect);

        if (editable) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'workshop-inline-btn';
            removeBtn.dataset.action = 'remove-ability';
            removeBtn.dataset.abilityId = ability.id;
            removeBtn.dataset.tabId = tabId;
            removeBtn.textContent = 'Remove';
            topRow.appendChild(removeBtn);
        }

        card.appendChild(topRow);

        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.value = ability.icon ?? '';
        iconInput.dataset.field = 'ability-icon';
        iconInput.dataset.abilityId = ability.id;
        iconInput.dataset.tabId = tabId;
        iconInput.placeholder = 'Icon URL or asset path';
        if (!editable) {
            iconInput.disabled = true;
        }
        card.appendChild(iconInput);

        card.appendChild(createAbilityTextarea('Description', 'ability-description', ability.id, tabId, ability.description ?? ''));
        card.appendChild(createAbilityTextarea('Unlock condition', 'ability-unlock-condition', ability.id, tabId, ability.unlock_condition ?? ''));
        card.appendChild(createAbilityTextarea('Use condition', 'ability-use-condition', ability.id, tabId, ability.use_condition ?? ''));
        card.appendChild(createAbilityTextarea('Trigger condition', 'ability-trigger-condition', ability.id, tabId, ability.trigger_condition ?? ''));
        card.appendChild(createAbilityTextarea('Grants', 'ability-grants', ability.id, tabId, ability.grants ?? ''));
    }

    function createAbilityTextarea(label, field, abilityId, tabId, value) {
        const wrap = document.createElement('label');
        wrap.className = 'workshop-item-stack';

        const text = document.createElement('span');
        text.className = 'workshop-item-label';
        text.textContent = label;

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.dataset.field = field;
        textarea.dataset.abilityId = abilityId;
        textarea.dataset.tabId = tabId;
        if (!editable) {
            textarea.disabled = true;
        }

        wrap.appendChild(text);
        wrap.appendChild(textarea);
        return wrap;
    }

    function appendFormulaCardFields(card, formula) {
        const row = document.createElement('div');
        row.className = 'workshop-item-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = formula.name;
        nameInput.placeholder = 'Formula name';
        nameInput.dataset.field = 'formula-name';
        nameInput.dataset.formulaId = formula.id;
        if (!editable) {
            nameInput.disabled = true;
        }

        row.appendChild(nameInput);

        if (editable) {
            const previewBtn = document.createElement('button');
            previewBtn.type = 'button';
            previewBtn.className = 'workshop-inline-btn';
            previewBtn.dataset.action = 'preview-formula';
            previewBtn.dataset.formulaId = formula.id;
            previewBtn.textContent = 'Preview';
            row.appendChild(previewBtn);

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

        card.appendChild(row);

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

        const preview = document.createElement('div');
        preview.className = 'workshop-formula-preview';
        preview.dataset.formulaPreview = formula.id;

        expressionWrap.appendChild(expressionInput);
        expressionWrap.appendChild(status);
        expressionWrap.appendChild(preview);
        card.appendChild(expressionWrap);
    }

    // Рендер списка формул, их полей и служебных кнопок.
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

            // Строка статуса валидации выражения.
            const status = document.createElement('div');
            status.className = 'workshop-formula-status';
            status.dataset.formulaStatus = formula.id;

            // Строка результата предпросмотра вычисления.
            const preview = document.createElement('div');
            preview.className = 'workshop-formula-preview';
            preview.dataset.formulaPreview = formula.id;

            expressionWrap.appendChild(expressionInput);
            expressionWrap.appendChild(status);
            expressionWrap.appendChild(preview);

            row.appendChild(nameInput);
            row.appendChild(expressionWrap);

            if (editable) {
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
                previewBtn.className = 'workshop-inline-btn';
                previewBtn.dataset.action = 'preview-formula';
                previewBtn.dataset.formulaId = formula.id;
                previewBtn.textContent = 'Preview';
                row.appendChild(previewBtn);

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

    // Рендер конструктора шаблонов листов токена.
    function renderSheetTemplatesPanel() {
        const listNode = root.querySelector('[data-sheet-template-list]');
        const editorNode = root.querySelector('[data-sheet-template-editor]');
        if (!listNode || !editorNode) {
            return;
        }

        listNode.innerHTML = '';
        editorNode.innerHTML = '';

        if (state.sheetTemplates.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No sheet templates yet.';
            listNode.appendChild(empty);
            return;
        }

        if (!state.sheetTemplates.find((template) => template.id === activeSheetTemplateId)) {
            activeSheetTemplateId = state.sheetTemplates[0]?.id ?? null;
        }

        state.sheetTemplates.forEach((template) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `workshop-tab-btn${template.id === activeSheetTemplateId ? ' active' : ''}`;
            btn.dataset.action = 'select-sheet-template';
            btn.dataset.sheetTemplateId = template.id;
            btn.textContent = template.name;
            listNode.appendChild(btn);
        });

        const template = getActiveSheetTemplate();
        if (!template) {
            return;
        }

        const header = document.createElement('div');
        header.className = 'workshop-sheet-template-header';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = template.name;
        nameInput.dataset.field = 'sheet-template-name';
        nameInput.dataset.sheetTemplateId = template.id;
        nameInput.placeholder = 'Template name';
        if (!editable) {
            nameInput.disabled = true;
        }

        header.appendChild(nameInput);

        if (editable) {
            const removeTemplateBtn = document.createElement('button');
            removeTemplateBtn.type = 'button';
            removeTemplateBtn.className = 'workshop-inline-btn';
            removeTemplateBtn.dataset.action = 'remove-sheet-template';
            removeTemplateBtn.dataset.sheetTemplateId = template.id;
            removeTemplateBtn.textContent = 'Remove template';
            header.appendChild(removeTemplateBtn);
        }

        editorNode.appendChild(header);

        const fields = Array.isArray(template.fields) ? template.fields : [];
        if (fields.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No fields in this template.';
            editorNode.appendChild(empty);
            return;
        }

        const fieldsNode = document.createElement('div');
        fieldsNode.className = 'workshop-sheet-field-list';

        fields
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .forEach((field) => {
                const row = document.createElement('div');
                row.className = 'workshop-sheet-field-row';
                row.dataset.sheetFieldId = field.id;
                row.dataset.sheetTemplateId = template.id;

                const labelInput = document.createElement('input');
                labelInput.type = 'text';
                labelInput.value = field.label ?? '';
                labelInput.dataset.field = 'sheet-field-label';
                labelInput.dataset.sheetTemplateId = template.id;
                labelInput.dataset.sheetFieldId = field.id;
                labelInput.placeholder = 'Label';
                if (!editable) {
                    labelInput.disabled = true;
                }

                const kindSelect = document.createElement('select');
                kindSelect.dataset.field = 'sheet-field-kind';
                kindSelect.dataset.sheetTemplateId = template.id;
                kindSelect.dataset.sheetFieldId = field.id;
                if (!editable) {
                    kindSelect.disabled = true;
                }
                ['resource', 'formula', 'local'].forEach((kind) => {
                    const option = document.createElement('option');
                    option.value = kind;
                    option.textContent = kind;
                    if ((field.kind ?? 'local') === kind) {
                        option.selected = true;
                    }
                    kindSelect.appendChild(option);
                });

                let sourceControl;
                if (field.kind === 'local') {
                    sourceControl = document.createElement('input');
                    sourceControl.type = 'text';
                    sourceControl.value = field.sourceKey ?? '';
                } else {
                    sourceControl = document.createElement('select');
                    const list = field.kind === 'resource' ? getAllResources() : getAllFormulaReferences();
                    list.forEach((entry) => {
                        const option = document.createElement('option');
                        option.value = entry.key;
                        option.textContent = `${entry.name} (${entry.key})`;
                        if (entry.key === field.sourceKey) {
                            option.selected = true;
                        }
                        sourceControl.appendChild(option);
                    });
                    if (list.length === 0) {
                        const option = document.createElement('option');
                        option.value = '';
                        option.textContent = 'No options';
                        sourceControl.appendChild(option);
                    }
                }
                sourceControl.dataset.field = 'sheet-field-source';
                sourceControl.dataset.sheetTemplateId = template.id;
                sourceControl.dataset.sheetFieldId = field.id;
                if (!editable) {
                    sourceControl.disabled = true;
                }

                const keyInput = document.createElement('input');
                keyInput.type = 'text';
                keyInput.value = field.key ?? '';
                keyInput.dataset.field = 'sheet-field-key';
                keyInput.dataset.sheetTemplateId = template.id;
                keyInput.dataset.sheetFieldId = field.id;
                keyInput.placeholder = 'Stored key';
                if (!editable) {
                    keyInput.disabled = true;
                }

                const inputTypeSelect = document.createElement('select');
                inputTypeSelect.dataset.field = 'sheet-field-input-type';
                inputTypeSelect.dataset.sheetTemplateId = template.id;
                inputTypeSelect.dataset.sheetFieldId = field.id;
                if (!editable) {
                    inputTypeSelect.disabled = true;
                }
                ['text', 'number', 'boolean'].forEach((inputType) => {
                    const option = document.createElement('option');
                    option.value = inputType;
                    option.textContent = inputType;
                    if ((field.inputType ?? 'text') === inputType) {
                        option.selected = true;
                    }
                    inputTypeSelect.appendChild(option);
                });

                const readOnlyWrap = document.createElement('label');
                readOnlyWrap.className = 'workshop-sheet-readonly';
                const readOnlyCheckbox = document.createElement('input');
                readOnlyCheckbox.type = 'checkbox';
                readOnlyCheckbox.checked = Boolean(field.readOnly);
                readOnlyCheckbox.dataset.field = 'sheet-field-readonly';
                readOnlyCheckbox.dataset.sheetTemplateId = template.id;
                readOnlyCheckbox.dataset.sheetFieldId = field.id;
                if (!editable || field.kind === 'formula') {
                    readOnlyCheckbox.disabled = true;
                }
                const readOnlyText = document.createElement('span');
                readOnlyText.textContent = 'read only';
                readOnlyWrap.appendChild(readOnlyCheckbox);
                readOnlyWrap.appendChild(readOnlyText);

                row.appendChild(labelInput);
                row.appendChild(kindSelect);
                row.appendChild(sourceControl);
                row.appendChild(keyInput);
                row.appendChild(inputTypeSelect);
                row.appendChild(readOnlyWrap);

                if (editable) {
                    const removeFieldBtn = document.createElement('button');
                    removeFieldBtn.type = 'button';
                    removeFieldBtn.className = 'workshop-inline-btn';
                    removeFieldBtn.dataset.action = 'remove-sheet-field';
                    removeFieldBtn.dataset.sheetTemplateId = template.id;
                    removeFieldBtn.dataset.sheetFieldId = field.id;
                    removeFieldBtn.textContent = 'Remove';
                    row.appendChild(removeFieldBtn);
                }

                fieldsNode.appendChild(row);
            });

        editorNode.appendChild(fieldsNode);
    }

    // Полная валидация всех формул:
    // - проверка синтаксиса;
    // - проверка неизвестных ссылок;
    // - проверка циклических зависимостей.
    function validateFormulas() {
        formulaValidationById.clear();

        const resources = getAllResources();
        const resourceKeys = new Set(resources.map((resource) => resource.key));

        // Рабочее представление формул для построения графа зависимостей.
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
                // Парсим выражение с уже нормализованными токенами.
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

        // Отдельно отмечаем формулы, попавшие в цикл зависимостей.
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

    // Поиск циклов через алгоритм топологической обработки (Kahn-like).
    // Формулы с остаточной входящей степенью считаются циклическими.
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

    // Перенос результатов валидации в DOM.
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

    // Перенос результатов предпросмотра вычислений в DOM.
    function updatePreviewUI() {
        root.querySelectorAll('[data-formula-preview]').forEach((node) => {
            const formulaId = node.dataset.formulaPreview;
            const preview = formulaPreviewById.get(formulaId);
            if (!preview) {
                node.className = 'workshop-formula-preview';
                node.textContent = '';
                return;
            }
            node.className = `workshop-formula-preview ${preview.status === 'ok' ? 'is-ok' : 'is-error'}`;
            node.textContent = preview.message;
        });
    }

    // Собираем tabs-представление из плоских коллекций для сохранения в документ.
    function buildTabsPayload() {
        return state.tabs.map((tab) => ({
            id: tab.id,
            name: tab.name,
            order: tab.order ?? 0,
            resources: state.resources
                .filter((resource) => resource.tabId === tab.id)
                .sort((left, right) => ((left.column ?? 0) - (right.column ?? 0)) || ((left.order ?? 0) - (right.order ?? 0)))
                .map((resource) => ({
                    id: resource.id,
                    name: resource.name,
                    type: resource.type,
                    position: {
                        column: resource.column ?? 0,
                        order: resource.order ?? 0,
                    },
                })),
            abilities: state.abilities
                .filter((ability) => ability.tabId === tab.id)
                .sort((left, right) => ((left.column ?? 0) - (right.column ?? 0)) || ((left.order ?? 0) - (right.order ?? 0)))
                .map((ability) => ({
                    id: ability.id,
                    name: ability.name,
                    type: ability.type,
                    position: {
                        column: ability.column ?? 0,
                        order: ability.order ?? 0,
                    },
                })),
            formulas: state.formulas
                .filter((formula) => formula.tabId === tab.id)
                .sort((left, right) => ((left.column ?? 0) - (right.column ?? 0)) || ((left.order ?? 0) - (right.order ?? 0)))
                .map((formula) => ({
                    id: formula.id,
                    name: formula.name,
                    expression: formula.expression,
                    position: {
                        column: formula.column ?? 0,
                        order: formula.order ?? 0,
                    },
                })),
        }));
    }

    // Карточки одной колонки собираются из всех поддерживаемых коллекций.
    function getColumnItems(tabId, column) {
        return getColumnItemsForLists(tabId, column, state.resources, state.abilities, state.formulas);
    }

    function getCollectionByKind(kind) {
        if (kind === 'resource') {
            return state.resources;
        }
        if (kind === 'ability') {
            return state.abilities;
        }
        return state.formulas;
    }

    function findItemByKind(kind, itemId) {
        return getCollectionByKind(kind).find((item) => item.id === itemId) ?? null;
    }

    function removeItemByKind(kind, itemId) {
        const collection = getCollectionByKind(kind);
        const index = collection.findIndex((item) => item.id === itemId);
        if (index === -1) {
            return null;
        }
        return collection.splice(index, 1)[0];
    }

    function reindexColumn(tabId, column) {
        const entries = getColumnItems(tabId, column);
        entries.forEach((entry, index) => {
            entry.item.column = column;
            entry.item.order = index;
        });
    }

    // Перемещение карточки любого типа между колонками/вкладками.
    function moveItem({ kind, itemId, fromTabId, toTabId, toColumn, beforeItemId }) {
        const item = findItemByKind(kind, itemId);
        if (!item) {
            return;
        }

        const fromColumn = item.column ?? 0;
        const sameColumn = fromTabId === toTabId && fromColumn === toColumn;
        const targetEntries = getColumnItems(toTabId, toColumn).filter((entry) => {
            return !(entry.kind === kind && entry.item.id === itemId);
        });

        let insertIndex = beforeItemId
            ? targetEntries.findIndex((entry) => entry.item.id === beforeItemId)
            : targetEntries.length;
        if (insertIndex < 0) {
            insertIndex = targetEntries.length;
        }

        item.tabId = toTabId;
        item.column = toColumn;
        targetEntries.splice(insertIndex, 0, { kind, item });
        targetEntries.forEach((entry, index) => {
            entry.item.tabId = toTabId;
            entry.item.column = toColumn;
            entry.item.order = index;
        });

        if (!sameColumn) {
            reindexColumn(fromTabId, fromColumn);
        }
    }

    // Собираем уникальный список ресурсов из всех вкладок.
    // Используется для автокомплита и валидации ссылок.
    function getAllResources() {
        const unique = new Map();
        state.resources.forEach((resource) => {
            const key = normalizeVariableName(resource.name);
            if (!unique.has(key)) {
                unique.set(key, {
                    name: resource.name,
                    key,
                    type: resource.type ?? 'text',
                });
            }
        });
        return [...unique.values()];
    }

    // Собираем список доступных ключей формул.
    function getAllFormulaReferences() {
        const unique = new Map();
        state.formulas.forEach((formula, index) => {
            const key = normalizeVariableName(formula.name || `formula_${index + 1}`);
            if (!unique.has(key)) {
                unique.set(key, {
                    name: formula.name || key,
                    key,
                });
            }
        });
        return [...unique.values()];
    }

    // Значение по умолчанию для предпросмотра вычислений формул.
    function getPreviewDefaultByType(type) {
        if (type === 'number') {
            return 10;
        }
        if (type === 'boolean') {
            return 1;
        }
        return 0;
    }

    // Подготовка входных значений для предпросмотра формул.
    function buildPreviewTokenValues() {
        const values = {};
        getAllResources().forEach((resource) => {
            values[resource.key] = getPreviewDefaultByType(resource.type);
        });
        return values;
    }

    // Преобразование формул из состояния в формат движка `computeAll`.
    function buildComputeFormulas() {
        return state.formulas.map((formula, index) => ({
            id: formula.id,
            name: formula.name,
            key: normalizeVariableName(formula.name || `formula_${index + 1}`),
            expression: formula.expression ?? '',
        }));
    }

    // Запуск предпросмотра конкретной формулы:
    // 1) проверяем валидность,
    // 2) считаем через общий движок формул,
    // 3) сохраняем результат/ошибку в `formulaPreviewById`.
    function runFormulaPreview(formulaId) {
        validateFormulas();
        const validation = formulaValidationById.get(formulaId);
        if (!validation || validation.status !== 'valid') {
            formulaPreviewById.set(formulaId, {
                status: 'error',
                message: validation?.message ?? 'Formula is invalid.',
            });
            updateValidationUI();
            updatePreviewUI();
            return;
        }

        const formula = state.formulas.find((item) => item.id === formulaId);
        if (!formula) {
            return;
        }

        const formulaKey = normalizeVariableName(formula.name);
        try {
            const values = computeAll(buildPreviewTokenValues(), buildComputeFormulas());
            const result = values[formulaKey];
            if (result === null || result === undefined || Number.isNaN(result)) {
                formulaPreviewById.set(formulaId, {
                    status: 'error',
                    message: 'Preview failed to compute value.',
                });
            } else {
                formulaPreviewById.set(formulaId, {
                    status: 'ok',
                    message: `Preview result: ${result} (defaults: number=10, boolean=1, other=0)`,
                });
            }
        } catch (error) {
            formulaPreviewById.set(formulaId, {
                status: 'error',
                message: `Preview error: ${error.message}`,
            });
        }
        updatePreviewUI();
    }

    // Список ссылок на другие формулы для автокомплита.
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

    // Инициализация popup-элемента автокомплита в `document.body`.
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

    // Открытие автокомплита для конкретного поля выражения.
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

    // Закрытие и очистка состояния автокомплита.
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

    // Определение контекста автокомплита:
    // - `resource_token`: курсор внутри конструкции `|...|`
    // - `general`: обычный ввод идентификатора/функции.
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

    // Формирование списка подсказок на основе контекста ввода.
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

    // Отрисовка пунктов popup-автокомплита.
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

    // Позиционирование popup под полем выражения.
    function positionAutocomplete() {
        if (!autocomplete.element || !autocomplete.input) {
            return;
        }

        const rect = autocomplete.input.getBoundingClientRect();
        autocomplete.element.style.left = `${rect.left + window.scrollX}px`;
        autocomplete.element.style.top = `${rect.bottom + window.scrollY + 4}px`;
        autocomplete.element.style.width = `${Math.max(260, rect.width)}px`;
    }

    // Перемещение активного пункта стрелками вверх/вниз.
    function moveAutocompleteSelection(step) {
        if (!autocomplete.items.length) {
            return;
        }
        const size = autocomplete.items.length;
        autocomplete.activeIndex = (autocomplete.activeIndex + step + size) % size;
        renderAutocomplete();
        positionAutocomplete();
    }

    // Вставка выбранного автокомплит-пункта в позицию курсора.
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

    // Реакция на ввод в поле выражения:
    // запускаем/обновляем автокомплит по текущему контексту.
    function onFormulaExpressionInput(input) {
        const formulaId = input.dataset.formulaId;
        openAutocomplete(input, formulaId, false);
    }

    // Горячие клавиши поля выражения для работы с автокомплитом.
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

    function getSheetTemplateById(templateId) {
        return state.sheetTemplates.find((template) => template.id === templateId) ?? null;
    }

    function getSheetFieldById(template, fieldId) {
        return (template?.fields ?? []).find((field) => field.id === fieldId) ?? null;
    }

    function reindexSheetTemplateFields(template) {
        if (!template || !Array.isArray(template.fields)) {
            return;
        }

        template.fields
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .forEach((field, index) => {
                field.order = index;
            });
    }

    function createSheetTemplate(name = null) {
        return {
            id: createId('sheet-template'),
            name: isNonEmptyString(name) ? name : `Template ${state.sheetTemplates.length + 1}`,
            fields: [],
        };
    }

    function createSheetTemplateField(kind = 'local') {
        const resources = getAllResources();
        const formulas = getAllFormulaReferences();
        let sourceKey = 'field';
        let inputType = 'text';

        if (kind === 'resource') {
            sourceKey = resources[0]?.key ?? 'resource';
            inputType = resources[0]?.type === 'number' ? 'number' : (resources[0]?.type === 'boolean' ? 'boolean' : 'text');
        } else if (kind === 'formula') {
            sourceKey = formulas[0]?.key ?? 'formula';
            inputType = 'number';
        } else {
            sourceKey = `field_${Date.now()}`;
            inputType = 'text';
        }

        return {
            id: createId('sheet-field'),
            label: kind === 'formula' ? 'Formula field' : (kind === 'resource' ? 'Resource field' : 'Local field'),
            kind,
            sourceKey,
            key: sourceKey,
            inputType,
            readOnly: kind === 'formula',
            order: 0,
        };
    }

    // Универсальный обработчик изменений всех управляемых полей конструктора.
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
            const resource = findItemByKind('resource', event.target.dataset.resourceId);
            if (resource) {
                resource.name = event.target.value;
            }
            formulaPreviewById.clear();
            validateFormulas();
            updateValidationUI();
            updatePreviewUI();
            syncFields();
            return;
        }

        if (field === 'resource-type') {
            const resource = findItemByKind('resource', event.target.dataset.resourceId);
            if (resource) {
                resource.type = event.target.value;
            }
            formulaPreviewById.clear();
            updatePreviewUI();
            syncFields();
            return;
        }

        if (field === 'ability-name') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.name = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-type') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.type = ['active', 'passive', 'special'].includes(event.target.value) ? event.target.value : 'active';
            }
            syncFields();
            return;
        }

        if (field === 'ability-icon') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.icon = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-description') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.description = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-unlock-condition') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.unlock_condition = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-use-condition') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.use_condition = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-trigger-condition') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.trigger_condition = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'ability-grants') {
            const ability = findItemByKind('ability', event.target.dataset.abilityId);
            if (ability) {
                ability.grants = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'formula-name') {
            const formula = state.formulas.find((item) => item.id === event.target.dataset.formulaId);
            if (formula) {
                formula.name = event.target.value;
            }
            formulaPreviewById.delete(event.target.dataset.formulaId);
            validateFormulas();
            updateValidationUI();
            updatePreviewUI();
            syncFields();
            return;
        }

        if (field === 'formula-expression') {
            const formula = state.formulas.find((item) => item.id === event.target.dataset.formulaId);
            if (formula) {
                formula.expression = event.target.value;
            }
            formulaPreviewById.delete(event.target.dataset.formulaId);
            validateFormulas();
            updateValidationUI();
            updatePreviewUI();
            syncFields();
            onFormulaExpressionInput(event.target);
            return;
        }

        if (field === 'sheet-template-name') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            if (template) {
                template.name = event.target.value;
            }
            renderSheetTemplatesPanel();
            syncFields();
            return;
        }

        if (field === 'sheet-field-label') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.label = event.target.value;
            }
            syncFields();
            return;
        }

        if (field === 'sheet-field-kind') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.kind = ['resource', 'formula', 'local'].includes(event.target.value) ? event.target.value : 'local';
                if (sheetField.kind === 'resource') {
                    sheetField.sourceKey = getAllResources()[0]?.key ?? 'resource';
                    sheetField.readOnly = false;
                } else if (sheetField.kind === 'formula') {
                    sheetField.sourceKey = getAllFormulaReferences()[0]?.key ?? 'formula';
                    sheetField.readOnly = true;
                    sheetField.inputType = 'number';
                } else {
                    sheetField.sourceKey = sheetField.key || normalizeVariableName(sheetField.label || 'field');
                    sheetField.readOnly = false;
                }
            }
            renderSheetTemplatesPanel();
            syncFields();
            return;
        }

        if (field === 'sheet-field-source') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.sourceKey = event.target.value ? normalizeVariableName(event.target.value) : '';
                if (!isNonEmptyString(sheetField.key)) {
                    sheetField.key = sheetField.sourceKey;
                }
            }
            syncFields();
            return;
        }

        if (field === 'sheet-field-key') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.key = normalizeVariableName(event.target.value);
            }
            syncFields();
            return;
        }

        if (field === 'sheet-field-input-type') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.inputType = ['text', 'number', 'boolean'].includes(event.target.value) ? event.target.value : 'text';
            }
            renderSheetTemplatesPanel();
            syncFields();
            return;
        }

        if (field === 'sheet-field-readonly') {
            const template = getSheetTemplateById(event.target.dataset.sheetTemplateId);
            const sheetField = getSheetFieldById(template, event.target.dataset.sheetFieldId);
            if (sheetField) {
                sheetField.readOnly = event.target.checked || sheetField.kind === 'formula';
            }
            syncFields();
        }
    }

    // Делегирование кликов по всем кнопкам интерфейса конструктора.
    root.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) {
            return;
        }

        const action = actionEl.dataset.action;
        if (!editable && action !== 'select-tab' && action !== 'select-sheet-template') {
            return;
        }

        if (action === 'select-tab') {
            setActiveTab(actionEl.dataset.tabId);
            return;
        }

        if (action === 'select-sheet-template') {
            setActiveSheetTemplate(actionEl.dataset.sheetTemplateId);
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
            state.resources = state.resources.filter((resource) => resource.tabId !== tabId);
            state.abilities = state.abilities.filter((ability) => ability.tabId !== tabId);
            state.formulas = state.formulas.filter((formula) => formula.tabId !== tabId);
            state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
            if (activeTabId === tabId) {
                activeTabId = state.tabs[0]?.id ?? null;
            }
            formulaPreviewById.clear();
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
            const column = getColumnItems(tab.id, 0).length <= getColumnItems(tab.id, 1).length ? 0 : 1;
            const order = getColumnItems(tab.id, column).length;
            state.resources.push({
                id: createId('res'),
                name: `Resource ${state.resources.length + 1}`,
                type: 'text',
                tabId: tab.id,
                column,
                order,
            });
            render();
            return;
        }

        if (action === 'remove-resource') {
            const removed = removeItemByKind('resource', actionEl.dataset.resourceId);
            if (removed) {
                reindexColumn(removed.tabId, removed.column ?? 0);
            }
            render();
            return;
        }

        if (action === 'add-ability') {
            if (state.tabs.length === 0) {
                const tab = createDefaultTab('Tab 1', 0);
                state.tabs.push(tab);
                activeTabId = tab.id;
            }

            const tab = getActiveTab() ?? state.tabs[0];
            const column = getColumnItems(tab.id, 0).length <= getColumnItems(tab.id, 1).length ? 0 : 1;
            const order = getColumnItems(tab.id, column).length;
            state.abilities.push({
                id: createId('ability'),
                name: `Ability ${state.abilities.length + 1}`,
                description: '',
                unlock_condition: '',
                use_condition: '',
                trigger_condition: '',
                type: 'active',
                grants: '',
                icon: '',
                tabId: tab.id,
                column,
                order,
            });
            render();
            return;
        }

        if (action === 'remove-ability') {
            const removed = removeItemByKind('ability', actionEl.dataset.abilityId);
            if (removed) {
                reindexColumn(removed.tabId, removed.column ?? 0);
            }
            render();
            return;
        }

        if (action === 'add-formula') {
            if (state.tabs.length === 0) {
                const tab = createDefaultTab('Tab 1', 0);
                state.tabs.push(tab);
                activeTabId = tab.id;
            }

            const tab = getActiveTab() ?? state.tabs[0];
            const column = getColumnItems(tab.id, 0).length <= getColumnItems(tab.id, 1).length ? 0 : 1;
            const order = getColumnItems(tab.id, column).length;
            state.formulas.push({
                id: createId('formula'),
                name: `Formula ${state.formulas.length + 1}`,
                expression: '',
                tabId: tab.id,
                column,
                order,
            });
            formulaPreviewById.clear();
            render();
            return;
        }

        if (action === 'remove-formula') {
            const removed = removeItemByKind('formula', actionEl.dataset.formulaId);
            if (removed) {
                formulaPreviewById.delete(removed.id);
                reindexColumn(removed.tabId, removed.column ?? 0);
            }
            render();
            return;
        }

        if (action === 'add-sheet-template') {
            const template = createSheetTemplate();
            state.sheetTemplates.push(template);
            activeSheetTemplateId = template.id;
            render();
            return;
        }

        if (action === 'remove-sheet-template') {
            const templateId = actionEl.dataset.sheetTemplateId;
            state.sheetTemplates = state.sheetTemplates.filter((template) => template.id !== templateId);
            if (activeSheetTemplateId === templateId) {
                activeSheetTemplateId = state.sheetTemplates[0]?.id ?? null;
            }
            render();
            return;
        }

        if (action === 'add-sheet-resource-field' || action === 'add-sheet-formula-field' || action === 'add-sheet-local-field') {
            let template = getActiveSheetTemplate();
            if (!template) {
                template = createSheetTemplate();
                state.sheetTemplates.push(template);
                activeSheetTemplateId = template.id;
            }

            const fieldKind = action === 'add-sheet-formula-field'
                ? 'formula'
                : (action === 'add-sheet-resource-field' ? 'resource' : 'local');

            const field = createSheetTemplateField(fieldKind);
            field.order = (template.fields ?? []).length;
            template.fields = [...(template.fields ?? []), field];
            reindexSheetTemplateFields(template);
            render();
            return;
        }

        if (action === 'remove-sheet-field') {
            const template = getSheetTemplateById(actionEl.dataset.sheetTemplateId);
            if (template) {
                template.fields = (template.fields ?? []).filter((field) => field.id !== actionEl.dataset.sheetFieldId);
                reindexSheetTemplateFields(template);
            }
            render();
            return;
        }

        if (action === 'preview-formula') {
            runFormulaPreview(actionEl.dataset.formulaId);
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

    // Подписки на основные события редактирования.
    root.addEventListener('input', handleFieldInput);
    root.addEventListener('change', handleFieldInput);
    root.addEventListener('keydown', onFormulaExpressionKeydown);

    // При фокусе на выражении обновляем статус валидации.
    root.addEventListener('focusin', (event) => {
        if (!editable || !event.target.matches('input[data-field="formula-expression"]')) {
            return;
        }
        validateFormulas();
        updateValidationUI();
    });

    // События drag-and-drop для переноса карточек между колонками.
    root.addEventListener('dragstart', (event) => {
        if (!editable) {
            return;
        }
        const card = event.target.closest('.workshop-item-card');
        if (!card) {
            return;
        }
        dragState = {
            itemKind: card.dataset.itemKind,
            itemId: card.dataset.itemId,
            tabId: card.dataset.tabId,
        };
        card.classList.add('is-dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    });

    root.addEventListener('dragend', (event) => {
        const card = event.target.closest('.workshop-item-card');
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
        const card = event.target.closest('.workshop-item-card');
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
        const card = event.target.closest('.workshop-item-card');
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
        if (card && card.dataset.itemId === dragState.itemId && card.dataset.itemKind === dragState.itemKind) {
            return;
        }

        moveItem({
            kind: dragState.itemKind,
            fromTabId: dragState.tabId,
            itemId: dragState.itemId,
            toTabId: targetTabId,
            toColumn: targetColumn,
            beforeItemId: card?.dataset.itemId ?? null,
        });

        render();
    });

    // Закрытие автокомплита при клике вне поля ввода/кнопки автокомплита.
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

    // Перепозиционирование popup при ресайзе окна.
    window.addEventListener('resize', () => {
        if (!autocomplete.element || autocomplete.element.classList.contains('is-hidden')) {
            return;
        }
        positionAutocomplete();
    });

    // Первичная отрисовка конструктора.
    render();
}
