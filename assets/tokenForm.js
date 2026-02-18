import { computeAll } from './formulaEngine.js';

function parseJson(value, fallback) {
    if (typeof value !== 'string' || value.trim() === '') {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function castByInputType(value, inputType) {
    if (inputType === 'number') {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    if (inputType === 'boolean') {
        return Boolean(value);
    }

    return value === null || value === undefined ? '' : String(value);
}

function defaultByInputType(inputType) {
    if (inputType === 'number') {
        return 0;
    }

    if (inputType === 'boolean') {
        return false;
    }

    return '';
}

function normalizeTemplateField(field, index) {
    const safe = typeof field === 'object' && field !== null ? field : {};
    return {
        id: typeof safe.id === 'string' && safe.id !== '' ? safe.id : `field-${index + 1}`,
        label: typeof safe.label === 'string' && safe.label.trim() !== '' ? safe.label : `Field ${index + 1}`,
        key: typeof safe.key === 'string' && safe.key.trim() !== '' ? safe.key : (safe.sourceKey || `field_${index + 1}`),
        kind: ['resource', 'formula', 'local'].includes(safe.kind) ? safe.kind : 'local',
        sourceKey: typeof safe.sourceKey === 'string' && safe.sourceKey.trim() !== '' ? safe.sourceKey : (safe.key || `field_${index + 1}`),
        inputType: ['text', 'number', 'boolean'].includes(safe.inputType) ? safe.inputType : 'text',
        readOnly: Boolean(safe.readOnly) || safe.kind === 'formula',
        order: Number.isFinite(Number(safe.order)) ? Number(safe.order) : index,
    };
}

// Синхронизация формы токена с выбранным шаблоном листа.
function initTokenBuilder(form) {
    if (!(form instanceof HTMLFormElement)) {
        return;
    }
    if (form.dataset.tokenBuilderInitialized === 'true') {
        return;
    }

    form.dataset.tokenBuilderInitialized = 'true';

    const systemSelect = form.querySelector('[name$="[workshopSystemId]"]');
    const templateSelect = form.querySelector('[name$="[sheetTemplateId]"]');
    const valuesJsonInput = form.querySelector('[name$="[valuesJson]"]');
    const fieldsContainer = form.querySelector('[data-token-template-fields]');
    const summaryContainer = form.querySelector('[data-token-template-summary]');

    if (!systemSelect || !templateSelect || !valuesJsonInput || !fieldsContainer) {
        return;
    }

    const catalogSource = form.querySelector('[data-token-template-catalog-source]');
    const valuesSource = form.querySelector('[data-token-values-source]');
    const catalogPayload = catalogSource instanceof HTMLTextAreaElement
        ? catalogSource.value
        : form.dataset.tokenTemplateCatalog;
    const valuesPayload = valuesSource instanceof HTMLTextAreaElement
        ? valuesSource.value
        : form.dataset.tokenValues;
    const catalog = parseJson(catalogPayload, {});
    const initialValues = parseJson(valuesPayload, {});
    let currentValues = typeof initialValues === 'object' && initialValues !== null ? { ...initialValues } : {};
    const templateMetas = [];

    Object.entries(catalog).forEach(([systemId, system]) => {
        if (!system || typeof system !== 'object') {
            return;
        }

        const systemName = typeof system.name === 'string' && system.name.trim() !== ''
            ? system.name.trim()
            : systemId;

        const templates = Array.isArray(system.sheetTemplates) ? system.sheetTemplates : [];
        templates.forEach((template) => {
            if (!template || typeof template !== 'object' || typeof template.id !== 'string' || template.id === '') {
                return;
            }

            templateMetas.push({
                templateId: template.id,
                systemId,
                systemName,
                templateName: typeof template.name === 'string' && template.name.trim() !== ''
                    ? template.name.trim()
                    : template.id,
                type: typeof template.type === 'string' ? template.type : 'character',
            });
        });
    });

    const getOptionTemplateId = (option) => {
        if (!option || !option.value) {
            return '';
        }

        const metaTemplateId = option.dataset.templateId;
        if (typeof metaTemplateId === 'string' && metaTemplateId !== '') {
            return metaTemplateId;
        }

        return option.value;
    };

    const findTemplateMeta = (systemId, templateId) => {
        if (typeof systemId !== 'string' || systemId === '' || typeof templateId !== 'string' || templateId === '') {
            return null;
        }

        return templateMetas.find((meta) => meta.systemId === systemId && meta.templateId === templateId) ?? null;
    };

    const parseTemplateLabel = (label) => {
        if (typeof label !== 'string') {
            return null;
        }

        const separator = ' -> ';
        const splitIndex = label.indexOf(separator);
        if (splitIndex <= 0) {
            return null;
        }

        const systemName = label.slice(0, splitIndex).trim();
        const templateName = label.slice(splitIndex + separator.length).trim();
        if (systemName === '' || templateName === '') {
            return null;
        }

        return { systemName, templateName };
    };

    const resolveOptionMeta = (option) => {
        if (!(option instanceof HTMLOptionElement) || !option.value) {
            return null;
        }

        const optionSystemId = option.dataset.systemId || '';
        const optionTemplateId = getOptionTemplateId(option);

        const byExactIds = findTemplateMeta(optionSystemId, optionTemplateId);
        if (byExactIds) {
            return byExactIds;
        }

        if (optionTemplateId !== '') {
            const byTemplateId = templateMetas.filter((meta) => meta.templateId === optionTemplateId);
            if (byTemplateId.length === 1) {
                return byTemplateId[0];
            }

            if (byTemplateId.length > 1 && systemSelect.value !== '') {
                const bySelectedSystem = byTemplateId.find((meta) => meta.systemId === systemSelect.value);
                if (bySelectedSystem) {
                    return bySelectedSystem;
                }
            }
        }

        const parsedLabel = parseTemplateLabel(option.textContent?.trim() ?? '');
        if (parsedLabel) {
            return templateMetas.find((meta) => {
                return meta.systemName === parsedLabel.systemName && meta.templateName === parsedLabel.templateName;
            }) ?? null;
        }

        return null;
    };

    const applyMetaToOption = (option, meta) => {
        if (!(option instanceof HTMLOptionElement) || !meta) {
            return;
        }

        option.dataset.templateId = meta.templateId;
        option.dataset.systemId = meta.systemId;
        option.dataset.templateType = meta.type;
    };

    const getSelectedTemplateOption = () => templateSelect.selectedOptions[0] ?? null;

    const getSelectedMeta = () => resolveOptionMeta(getSelectedTemplateOption());

    // Подстраховка: даже если backend не передал data-атрибуты option, наполним их из каталога.
    [...templateSelect.options].forEach((option) => {
        if (!option.value) {
            return;
        }

        applyMetaToOption(option, resolveOptionMeta(option));
    });

    const selectedMeta = getSelectedMeta();
    if (!systemSelect.value && selectedMeta?.systemId) {
        systemSelect.value = selectedMeta.systemId;
    }

    const getSelectedSystem = () => {
        const selectedMeta = getSelectedMeta();
        const systemId = systemSelect.value || selectedMeta?.systemId || '';
        const system = catalog[systemId];
        return typeof system === 'object' && system !== null ? system : null;
    };

    const getSelectedTemplate = () => {
        const selectedMeta = getSelectedMeta();
        if (!selectedMeta) {
            return null;
        }

        const system = catalog[selectedMeta.systemId];
        if (!system) {
            return null;
        }

        const templates = Array.isArray(system.sheetTemplates) ? system.sheetTemplates : [];
        const selectedTemplate = templates.find((template) => {
            return template && typeof template === 'object' && template.id === selectedMeta.templateId;
        });

        return selectedTemplate && typeof selectedTemplate === 'object' ? selectedTemplate : null;
    };

    const findFirstAllowedTemplateOption = () => {
        return [...templateSelect.options].find((option) => {
            return option.value && !option.disabled && !option.hidden;
        }) ?? null;
    };

    const ensureSystemFromSelectedTemplate = () => {
        const meta = getSelectedMeta();
        if (!meta || typeof meta.systemId !== 'string' || meta.systemId === '') {
            return false;
        }

        if (systemSelect.value === meta.systemId) {
            return false;
        }

        // Если выбран шаблон, но система не выбрана/не совпадает, синхронизируем систему автоматически.
        systemSelect.value = meta.systemId;

        return true;
    };

    const updateTemplateOptions = () => {
        const selectedSystemId = systemSelect.value;

        [...templateSelect.options].forEach((option) => {
            if (!option.value) {
                option.hidden = false;
                option.disabled = false;
                return;
            }

            const meta = resolveOptionMeta(option);
            applyMetaToOption(option, meta);

            // Если метаданные не удалось восстановить, не блокируем option на клиенте.
            const bySystem = selectedSystemId === '' || !meta || meta.systemId === selectedSystemId;
            const isAllowed = bySystem;
            option.hidden = !isAllowed;
            option.disabled = !isAllowed;
        });

        const selectedOption = templateSelect.selectedOptions[0];
        if (selectedOption && selectedOption.value && selectedOption.disabled) {
            templateSelect.value = '';
        }

        // Подбираем первый доступный шаблон, чтобы пользователь сразу увидел поля для ввода.
        if (!templateSelect.value) {
            const firstAllowed = findFirstAllowedTemplateOption();
            if (firstAllowed) {
                templateSelect.value = firstAllowed.value;
            }
        }
    };

    const computeTemplateFormulaValues = (template) => {
        const system = getSelectedSystem();
        if (!system || !template) {
            return;
        }

        const formulas = Array.isArray(system.formulas) ? system.formulas : [];
        if (formulas.length === 0) {
            return;
        }

        const baseValues = {};
        const resources = Array.isArray(system.resources) ? system.resources : [];
        resources.forEach((resource) => {
            if (!resource || typeof resource !== 'object') {
                return;
            }

            const resourceKey = typeof resource.key === 'string' ? resource.key : null;
            if (!resourceKey) {
                return;
            }

            if (resource.type === 'number') {
                baseValues[resourceKey] = 0;
                return;
            }

            if (resource.type === 'boolean') {
                baseValues[resourceKey] = false;
                return;
            }

            baseValues[resourceKey] = '';
        });
        const normalizedFields = (Array.isArray(template.fields) ? template.fields : [])
            .map((field, index) => normalizeTemplateField(field, index));

        normalizedFields.forEach((field) => {
            if (field.kind === 'formula' || field.readOnly) {
                return;
            }

            baseValues[field.key] = castByInputType(currentValues[field.key], field.inputType);
        });

        try {
            const computed = computeAll(baseValues, formulas);
            normalizedFields.forEach((field) => {
                if (field.kind !== 'formula') {
                    return;
                }
                currentValues[field.key] = computed[field.sourceKey] ?? currentValues[field.key] ?? '';
            });
        } catch (error) {
            // Игнорируем клиентскую ошибку вычисления, сервер пересчитает формулы при сохранении.
        }
    };

    const keepOnlyTemplateKeys = (template) => {
        const normalizedFields = (Array.isArray(template.fields) ? template.fields : [])
            .map((field, index) => normalizeTemplateField(field, index));

        const nextValues = {};
        normalizedFields.forEach((field) => {
            const fallback = defaultByInputType(field.inputType);
            nextValues[field.key] = castByInputType(currentValues[field.key] ?? fallback, field.inputType);
        });

        currentValues = nextValues;
    };

    const syncValuesJson = () => {
        valuesJsonInput.value = JSON.stringify(currentValues);
    };

    const renderFields = () => {
        fieldsContainer.innerHTML = '';

        const template = getSelectedTemplate();
        if (!template) {
            const hint = document.createElement('div');
            hint.className = 'token-template-hint';
            hint.textContent = 'Select workshop system and sheet template to edit template fields.';
            fieldsContainer.appendChild(hint);
            if (summaryContainer) {
                summaryContainer.textContent = '';
            }
            currentValues = {};
            syncValuesJson();
            return;
        }

        const normalizedFields = (Array.isArray(template.fields) ? template.fields : [])
            .map((field, index) => normalizeTemplateField(field, index))
            .sort((left, right) => left.order - right.order);

        if (summaryContainer) {
            summaryContainer.textContent = `${template.name} (${template.type})`;
        }

        if (normalizedFields.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'token-template-hint';
            hint.textContent = 'Selected sheet template has no fields.';
            fieldsContainer.appendChild(hint);
            currentValues = {};
            syncValuesJson();
            return;
        }

        computeTemplateFormulaValues(template);

        normalizedFields.forEach((field) => {
            const row = document.createElement('div');
            row.className = 'token-template-field';

            const label = document.createElement('label');
            label.className = 'token-template-label';
            label.textContent = field.label;

            const meta = document.createElement('small');
            meta.className = 'token-template-meta';
            meta.textContent = `${field.kind} -> ${field.sourceKey}`;

            const inputWrap = document.createElement('div');
            inputWrap.className = 'token-template-input-wrap';

            let input;
            if (field.inputType === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = Boolean(currentValues[field.key]);
            } else {
                input = document.createElement('input');
                input.type = field.inputType === 'number' ? 'number' : 'text';
                const fallback = defaultByInputType(field.inputType);
                input.value = castByInputType(currentValues[field.key] ?? fallback, field.inputType);
            }

            input.dataset.fieldKey = field.key;
            input.dataset.inputType = field.inputType;
            input.disabled = field.readOnly;
            input.className = 'token-template-input';

            if (field.readOnly) {
                input.title = 'Calculated field';
            }

            const updateFieldValue = () => {
                const key = input.dataset.fieldKey;
                const inputType = input.dataset.inputType || 'text';
                if (!key) {
                    return;
                }

                if (inputType === 'boolean') {
                    currentValues[key] = input.checked;
                } else {
                    currentValues[key] = castByInputType(input.value, inputType);
                }

                const selectedTemplate = getSelectedTemplate();
                if (selectedTemplate) {
                    computeTemplateFormulaValues(selectedTemplate);
                }

                syncValuesJson();
                renderFields();
            };

            input.addEventListener('input', updateFieldValue);
            input.addEventListener('change', updateFieldValue);

            row.appendChild(label);
            row.appendChild(meta);
            inputWrap.appendChild(input);
            row.appendChild(inputWrap);

            fieldsContainer.appendChild(row);
        });

        syncValuesJson();
    };

    const refresh = () => {
        updateTemplateOptions();
        if (ensureSystemFromSelectedTemplate()) {
            updateTemplateOptions();
        }

        const template = getSelectedTemplate();
        if (template) {
            keepOnlyTemplateKeys(template);
        } else {
            currentValues = {};
        }

        renderFields();
    };

    systemSelect.addEventListener('change', refresh);
    templateSelect.addEventListener('change', refresh);

    refresh();
}

function initAllTokenBuilders() {
    document.querySelectorAll('form[data-token-builder="true"]').forEach((form) => {
        initTokenBuilder(form);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllTokenBuilders);
} else {
    initAllTokenBuilders();
}

document.addEventListener('modal:content-updated', initAllTokenBuilders);
