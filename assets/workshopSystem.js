// Ищем корневой элемент билдера по data-атрибуту
const root = document.querySelector('[data-workshop-builder]');

if (root) {
    const editable = root.dataset.editable === 'true'; // Можно ли редактировать
    const payload = window.WORKSHOP_SYSTEM ?? {}; // Данные из начального объекта
    // Нормализуем ресурсы и вкладки
    const resources = normalizeResources(payload.resources);
    const tabs = normalizeTabs(payload.tabs, resources);
    // Основное состояние билдера
    const state = {
        settings: payload.settings ?? {},
        resources,
        tabs,
        formulas: Array.isArray(payload.formulas) ? payload.formulas : [],
        meta: payload.meta ?? {},
    };
    // Активная вкладка — по умолчанию первая
    let activeTabId = state.tabs[0]?.id ?? null;
    // Сюда собираем скрытые поля формы (для сериализации JSON перед отправкой)
    const fields = {};
    $('[data-workshop-field]').each(function () {
        const key = $(this).data('workshop-field'); // автоматически преобразует data-workshop-field
        fields[key] = this; // сохраняем сам DOM-элемент
    });
    // ---------------------------
    // НОРМАЛИЗАЦИЯ ДАННЫХ
    // ---------------------------
    /** Нормализация ресурсов */
    function normalizeResources(list) {
        // Чек если массив
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((resource) => {
            const safe = isPlainObject(resource) ? resource : {};
            if (!isNonEmptyString(safe.id)) { // Гарантируем id
                safe.id = createId('res');
            }
            if (!isNonEmptyString(safe.name)) { // Гарантируем имя
                safe.name = 'Resource';
            }
            if (!isNonEmptyString(safe.type)) { // Тип по умолчанию — text
                safe.type = 'text';
            }
            if (!isPlainObject(safe.data) && !Array.isArray(safe.data)) { // Гарантируем корректный data-объект
                safe.data = { value: '' };
            }
            return safe;
        });
    }
    /** Нормализация вкладок */
    function normalizeTabs(list, resourcesList) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list.map((tab, index) => {
            const safe = isPlainObject(tab) ? tab : {};
            if (!isNonEmptyString(safe.id)) { // Гарантируем id вкладки
                safe.id = createId('tab');
            }
            if (!isNonEmptyString(safe.name)) { // Если нет имени — создаём "Tab 1", "Tab 2" и т.д.
                safe.name = `Tab ${index + 1}`;
            }
            safe.order = Number.isInteger(safe.order) ? safe.order : index; // Порядок вкладки
            safe.elements = Array.isArray(safe.elements) ? safe.elements : []; // Элементы вкладки
            safe.elements = safe.elements.map((element) => normalizeElement(element, resourcesList));
            return safe;
        });
    }
    /** Нормализация элементов */
    function normalizeElement(element, resourcesList) {
        const safe = isPlainObject(element) ? element : {};
        if (!isNonEmptyString(safe.id)) { // Гарантируем id элемента
            safe.id = createId('el');
        }
        if (!isNonEmptyString(safe.resourceId)) { // Если resourceId не указан — ставим первый ресурс
            safe.resourceId = resourcesList[0]?.id ?? '';
        }
        // Координаты элемента (позиция на листе)
        safe.x = isNumeric(safe.x) ? Number(safe.x) : 0;
        safe.y = isNumeric(safe.y) ? Number(safe.y) : 0;
        return safe;
    }
    // ---------------------------
    // ВСПОМОГАТЕЛЬНЫЕ ПРОВЕРКИ
    // ---------------------------
    function isPlainObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    function isNumeric(value) {
        return value !== null && value !== '' && !Number.isNaN(Number(value));
    }
    // Создание уникального id (UUID если поддерживается браузером)
    function createId(prefix) {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }
        return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    }
    // ---------------------------
    // УПРАВЛЕНИЕ ВКЛАДКАМИ
    // ---------------------------
    function setActiveTab(tabId) {
        activeTabId = tabId;
        renderTabsBar();
        renderTabPanel();
    }

    function getActiveTab() {
        return state.tabs.find((tab) => tab.id === activeTabId) ?? null;
    }
    // ---------------------------
    // СИНХРОНИЗАЦИЯ С ФОРМОЙ
    // ---------------------------
    function syncFields() {
        if (fields.settings) {
            fields.settings.value = JSON.stringify(state.settings ?? {});
        }
        if (fields.resources) {
            fields.resources.value = JSON.stringify(state.resources ?? []);
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
    // Главный render — перерисовывает всё
    function render() {
        renderTabsBar();
        renderTabPanel();
        renderResourcesPanel();
        syncFields(); // после любого рендера синхронизируем данные
    }
    // ---------------------------
    // RENDER: Панель вкладок
    // ---------------------------
    function renderTabsBar() {
        const tabsBar = root.querySelector('[data-tabs-bar]');
        if (!tabsBar) {
            return;
        }

        tabsBar.innerHTML = '';
        // Если вкладок нет — показываем сообщение
        if (state.tabs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No tabs yet.';
            tabsBar.appendChild(empty);
            return;
        }
        // Создаём кнопку для каждой вкладки
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
    // ---------------------------
    // RENDER: Панель текущей вкладки
    // ---------------------------
    function renderTabPanel() {
        const panel = root.querySelector('[data-tab-panel]');
        if (!panel) {
            return;
        }

        panel.innerHTML = '';
        const tab = getActiveTab();
        // Если вкладка не выбрана
        if (!tab) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'Select a tab to edit its elements.';
            panel.appendChild(empty);
            return;
        }
        // Заголовок вкладки
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
        // Элементы вкладки
        const elementsWrapper = document.createElement('div');
        elementsWrapper.className = 'workshop-elements';
        // Если у вкладки нет элементов — показываем заглушку
        if (tab.elements.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No elements in this tab.';
            elementsWrapper.appendChild(empty);
        } else {
            // Если элементы есть — создаём строку для каждого
            tab.elements.forEach((element) => {
                // Контейнер одной строки элемента
                const row = document.createElement('div');
                row.className = 'workshop-element-row';
                // -----------------------------
                // SELECT: выбор ресурса
                // -----------------------------
                const resourceSelect = document.createElement('select');
                // data-атрибуты используются потом в обработчике событий
                resourceSelect.dataset.field = 'element-resource';
                resourceSelect.dataset.elementId = element.id;
                resourceSelect.dataset.tabId = tab.id;
                // Если режим только чтения — блокируем поле
                if (!editable) {
                    resourceSelect.disabled = true;
                }
                // Создаём option для каждого доступного ресурса
                state.resources.forEach((resource) => {
                    const option = document.createElement('option');
                    option.value = resource.id;
                    option.textContent = resource.name;
                    // Если ресурс совпадает с текущим — отмечаем как выбранный
                    if (resource.id === element.resourceId) {
                        option.selected = true;
                    }
                    resourceSelect.appendChild(option);
                });
                // -----------------------------
                // INPUT: координата X
                // -----------------------------
                const posX = document.createElement('input');
                posX.type = 'number';
                posX.value = element.x ?? 0;
                posX.dataset.field = 'element-x';
                posX.dataset.elementId = element.id;
                posX.dataset.tabId = tab.id;
                posX.placeholder = 'X';
                if (!editable) {
                    posX.disabled = true;
                }
                // -----------------------------
                // INPUT: координата Y
                // -----------------------------
                const posY = document.createElement('input');
                posY.type = 'number';
                posY.value = element.y ?? 0;
                posY.dataset.field = 'element-y';
                posY.dataset.elementId = element.id;
                posY.dataset.tabId = tab.id;
                posY.placeholder = 'Y';
                if (!editable) {
                    posY.disabled = true;
                }
                // Добавляем select и координаты в строку
                row.appendChild(resourceSelect);
                row.appendChild(posX);
                row.appendChild(posY);
                // -----------------------------
                // КНОПКА УДАЛЕНИЯ (только в editable режиме)
                // -----------------------------
                if (editable) {
                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'workshop-inline-btn';
                    // Через data-action потом ловится делегированным обработчиком click
                    removeBtn.dataset.action = 'remove-element';
                    removeBtn.dataset.elementId = element.id;
                    removeBtn.dataset.tabId = tab.id;
                    removeBtn.textContent = 'Remove';
                    row.appendChild(removeBtn);
                }
                // Добавляем строку элемента в контейнер вкладки
                elementsWrapper.appendChild(row);
            });
        }
        // В конце добавляем весь контейнер элементов в панель вкладки
        panel.appendChild(elementsWrapper);
    }

    function renderResourcesPanel() {
        // Ищем контейнер панели ресурсов внутри root
        const panel = root.querySelector('[data-resources-panel]');
        if (!panel) {
            return;
        }
        // Полностью очищаем панель перед повторной отрисовкой
        // (мы пересобираем DOM каждый раз из state)
        panel.innerHTML = '';
        // Если ресурсов нет — показываем заглушку
        if (state.resources.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workshop-empty';
            empty.textContent = 'No resources yet.';
            panel.appendChild(empty);
            return; // дальше рендерить нечего
        }
        // Проходим по каждому ресурсу из состояния
        state.resources.forEach((resource) => {
            // Контейнер строки одного ресурса
            const row = document.createElement('div');
            row.className = 'workshop-resource-row';
            // -----------------------------
            // INPUT: имя ресурса
            // -----------------------------
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = resource.name;
            // data-атрибуты используются делегированными обработчиками
            nameInput.dataset.field = 'resource-name';
            nameInput.dataset.resourceId = resource.id;
            if (!editable) {
                nameInput.disabled = true;
            }
            // -----------------------------
            // SELECT: тип ресурса
            // -----------------------------
            const typeSelect = document.createElement('select');
            typeSelect.dataset.field = 'resource-type';
            typeSelect.dataset.resourceId = resource.id;
            if (!editable) {
                typeSelect.disabled = true;
            }
            // Возможные типы ресурса
            ['text', 'number', 'boolean', 'select'].forEach((type) => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                // Если тип совпадает с текущим — отмечаем выбранным
                if (resource.type === type) {
                    option.selected = true;
                }
                typeSelect.appendChild(option);
            });
            // -----------------------------
            // INPUT: значение по умолчанию
            // -----------------------------
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            // Берём значение из resource.data.value, если оно существует
            valueInput.value = resource.data?.value ?? '';
            valueInput.placeholder = 'Value';
            valueInput.dataset.field = 'resource-value';
            valueInput.dataset.resourceId = resource.id;
            if (!editable) {
                valueInput.disabled = true;
            }
            // Добавляем элементы в строку
            row.appendChild(nameInput);
            row.appendChild(typeSelect);
            row.appendChild(valueInput);
            // -----------------------------
            // КНОПКА УДАЛЕНИЯ (только если можно редактировать)
            // -----------------------------
            if (editable) {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'workshop-inline-btn';
                removeBtn.dataset.action = 'remove-resource';
                removeBtn.dataset.resourceId = resource.id;
                removeBtn.textContent = 'Remove';
                row.appendChild(removeBtn);
            }

            panel.appendChild(row);
        });
    }
    // Обновляет отображаемое имя ресурса во всех select'ах элементов, где этот ресурс используется
    function updateResourceOptionLabels(resourceId, name) {
        // Ищем ВСЕ option внутри select элементов, которые ссылаются на данный resourceId
        root.querySelectorAll(`select[data-field="element-resource"] option[value="${resourceId}"]`)
            .forEach((option) => {
                option.textContent = name; // Меняем текст option (чтобы сразу обновилось в UI)
            });
    }
    /** Обработчик кликов */ 
    root.addEventListener('click', (event) => {
        // Ищем ближайший элемент с data-action (поддержка кликов по вложенным элементам)
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) { // Если клик не по элементу с action — ничего не делае
            return;
        }
        // Тип действия (add-tab, remove-resource и т.д.)
        const action = actionEl.dataset.action;
        if (!editable && action !== 'select-tab') { // Если режим read-only — разрешаем только переключение вкладок
            return;
        }
        // Переключение вкладки
        if (action === 'select-tab') {
            setActiveTab(actionEl.dataset.tabId);
            return;
        }
        // Добавление вкладки
        if (action === 'add-tab') {
            const tab = {
                id: createId('tab'),
                name: `Tab ${state.tabs.length + 1}`,
                order: state.tabs.length,
                elements: [],
            };
            state.tabs.push(tab);
            setActiveTab(tab.id);
            render();
            return;
        }
        // Удаление вкладки
        if (action === 'remove-tab') {
            const tabId = actionEl.dataset.tabId;
            state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
            if (activeTabId === tabId) { // Если удалили активную — выбираем первую доступную
                activeTabId = state.tabs[0]?.id ?? null;
            }
            render();
            return;
        }
        // Добавление ресурса
        if (action === 'add-resource') {
            const resource = {
                id: createId('res'),
                name: `Resource ${state.resources.length + 1}`,
                type: 'text',
                data: { value: '' },
            };
            state.resources.push(resource);
            render();
            return;
        }
        // Удаление ресурса
        if (action === 'remove-resource') {
            const resourceId = actionEl.dataset.resourceId;
            state.resources = state.resources.filter((resource) => resource.id !== resourceId); // Удаляем ресурс
            state.tabs.forEach((tab) => { // Удаляем все элементы, которые ссылались на этот ресурс
                tab.elements = tab.elements.filter((element) => element.resourceId !== resourceId);
            });
            render();
            return;
        }
        // Добавление ресурса
        if (action === 'add-element') {
            if (state.tabs.length === 0) { // Если вкладок нет — создаём первую
                const tab = {
                    id: createId('tab'),
                    name: 'Tab 1',
                    order: 0,
                    elements: [],
                };
                state.tabs.push(tab);
                activeTabId = tab.id;
            }

            if (state.resources.length === 0) { // Если нет ресурсов — создаём первый
                state.resources.push({
                    id: createId('res'),
                    name: 'Resource 1',
                    type: 'text',
                    data: { value: '' },
                });
            }

            const tab = getActiveTab() ?? state.tabs[0]; // Берём активную вкладку

            tab.elements.push({ // Добавляем элемент с привязкой к первому ресурсу
                id: createId('el'),
                resourceId: state.resources[0].id,
                x: 0,
                y: 0,
            });
            render();
            return;
        }
        // Удаление ресурса
        if (action === 'remove-element') {
            const tabId = actionEl.dataset.tabId;
            const elementId = actionEl.dataset.elementId;
            const tab = state.tabs.find((item) => item.id === tabId);
            if (tab) { // Удаляем элемент из массива
                tab.elements = tab.elements.filter((element) => element.id !== elementId);
            }
            render();
        }
    });
    // ---------------------------
    // ОБРАБОТЧИК ВВОДА
    // ---------------------------
    // Универсальный обработчик всех input/change событий внутри builder'а
    function handleFieldInput(event) {
        if (!editable) { // Если режим только чтения — выходим
            return;
        }
        const field = event.target.dataset.field; // Определяем тип поля через data-field
        if (!field) { // Если поле не относится к нашей системе — игнорируем
            return;
        }
        // Изменение имени вкладки
        if (field === 'tab-name') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId); // Ищем вкладку по id
            if (tab) {
                // Обновляем состояние
                tab.name = event.target.value;
                const tabButton = root.querySelector(`[data-action="select-tab"][data-tab-id="${tab.id}"]`);
                if (tabButton) {
                    tabButton.textContent = tab.name || 'Tab';
                }
            }
            // Синхронизируем hidden-поля формы
            syncFields();
            return;
        }
        // ИЗМЕНЕНИЕ ИМЕНИ РЕСУРСА
        if (field === 'resource-name') {
            const resource = state.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                resource.name = event.target.value;
                // Обновляем label во всех select'ах элементов
                updateResourceOptionLabels(resource.id, resource.name || 'Resource');
            }
            syncFields();
            return;
        }
        // ИЗМЕНЕНИЕ ТИПА РЕСУРСА
        if (field === 'resource-type') {
            const resource = state.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                resource.type = event.target.value;
            }
            syncFields();
            return;
        }
        // ИЗМЕНЕНИЕ ЗНАЧЕНИЯ РЕСУРСА
        if (field === 'resource-value') {
            const resource = state.resources.find((item) => item.id === event.target.dataset.resourceId);
            if (resource) {
                if (!isPlainObject(resource.data) && !Array.isArray(resource.data)) {
                    resource.data = {};
                }
                resource.data.value = event.target.value;
            }
            syncFields();
            return;
        }
        // СМЕНА РЕСУРСА У ЭЛЕМЕНТА
        if (field === 'element-resource') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            const element = tab?.elements.find((item) => item.id === event.target.dataset.elementId);
            if (element) {
                element.resourceId = event.target.value;
            }
            syncFields();
            return;
        }
        // ИЗМЕНЕНИЕ КООРДИНАТ ЭЛЕМЕНТА
        if (field === 'element-x' || field === 'element-y') {
            const tab = state.tabs.find((item) => item.id === event.target.dataset.tabId);
            const element = tab?.elements.find((item) => item.id === event.target.dataset.elementId);
            if (element) {
                const value = isNumeric(event.target.value) ? Number(event.target.value) : 0;
                if (field === 'element-x') {
                    element.x = value;
                } else {
                    element.y = value;
                }
            }
            syncFields();
        }
    }
    // Слушаем ввод текста (input)
    root.addEventListener('input', handleFieldInput);
    // Слушаем change (select, checkbox и т.д.)
    root.addEventListener('change', handleFieldInput);
    // Первый рендер при инициализации builder'а
    render();
}
