<?php

namespace App\Service;

use App\Document\WorkshopSystem;

/**
 * Сервис собирает единый каталог шаблонов листов по системам.
 * Каталог нужен и в UI, и в контроллерах для валидации/приведения значений.
 */
final class SheetTemplateCatalogBuilder
{
    /**
     * @param iterable<WorkshopSystem> $systems
     *
     * @return array<string, array<string, mixed>>
     */
    public function buildCatalog(iterable $systems): array
    {
        $catalog = [];

        foreach ($systems as $system) {
            if (!$system instanceof WorkshopSystem) {
                continue;
            }

            $systemId = $system->getId();
            if (!is_string($systemId) || $systemId === '') {
                continue;
            }

            $resources = $this->normalizeResources($system->getTabs());
            $formulas = $this->normalizeFormulas($system->getFormulas());
            $sheetTemplates = $this->normalizeSheetTemplates(
                $system->getSheetTemplates(),
                array_map(static fn (array $resource): string => $resource['key'], $resources),
                array_map(static fn (array $formula): string => $formula['key'], $formulas)
            );

            $catalog[$systemId] = [
                'id' => $systemId,
                'name' => $system->getName(),
                'resources' => $resources,
                'formulas' => $formulas,
                'sheetTemplates' => $sheetTemplates,
            ];
        }

        return $catalog;
    }

    /**
     * @param array<string, array<string, mixed>> $catalog
     */
    public function findSheetTemplate(array $catalog, ?string $systemId, ?string $sheetTemplateId): ?array
    {
        if (!is_string($systemId) || $systemId === '') {
            return null;
        }

        if (!is_string($sheetTemplateId) || $sheetTemplateId === '') {
            return null;
        }

        $system = $catalog[$systemId] ?? null;
        if (!is_array($system)) {
            return null;
        }

        foreach (($system['sheetTemplates'] ?? []) as $template) {
            if (!is_array($template)) {
                continue;
            }

            if (($template['id'] ?? null) === $sheetTemplateId) {
                return $template;
            }
        }

        return null;
    }

    /**
     * @param array<string, array<string, mixed>> $catalog
     *
     * @return array<string, string>
     */
    public function buildSystemChoices(array $catalog): array
    {
        $choices = [];
        foreach ($catalog as $systemId => $system) {
            if (!is_array($system)) {
                continue;
            }

            $label = is_string($system['name'] ?? null) ? $system['name'] : $systemId;
            $choices[$label] = $systemId;
        }

        return $choices;
    }

    /**
     * @param array<string, array<string, mixed>> $catalog
     *
     * @return array{choices: array<string, string>, attrs: array<string, array<string, string>>}
     */
    public function buildTemplateChoices(array $catalog): array
    {
        $choices = [];
        $attrs = [];

        foreach ($catalog as $systemId => $system) {
            if (!is_array($system)) {
                continue;
            }

            $systemName = is_string($system['name'] ?? null) ? $system['name'] : $systemId;
            $templates = is_array($system['sheetTemplates'] ?? null) ? $system['sheetTemplates'] : [];

            foreach ($templates as $template) {
                if (!is_array($template)) {
                    continue;
                }

                $templateId = $template['id'] ?? null;
                if (!is_string($templateId) || $templateId === '') {
                    continue;
                }

                $templateName = is_string($template['name'] ?? null) ? $template['name'] : $templateId;
                $templateType = is_string($template['type'] ?? null) ? $template['type'] : 'character';

                $choices[sprintf('%s -> %s', $systemName, $templateName)] = $templateId;
                $attrs[$templateId] = [
                    'data-template-id' => $templateId,
                    'data-system-id' => $systemId,
                    'data-template-type' => $templateType,
                ];
            }
        }

        return [
            'choices' => $choices,
            'attrs' => $attrs,
        ];
    }

    /**
     * @param array<string, mixed> $template
     * @param array<string, mixed> $rawValues
     *
     * @return array<string, mixed>
     */
    public function normalizeEditableValues(array $template, array $rawValues): array
    {
        $values = [];
        $fields = is_array($template['fields'] ?? null) ? $template['fields'] : [];

        foreach ($fields as $field) {
            if (!is_array($field)) {
                continue;
            }

            $kind = is_string($field['kind'] ?? null) ? $field['kind'] : 'local';
            $readOnly = (bool) ($field['readOnly'] ?? false);
            if ($kind === 'formula' || $readOnly) {
                continue;
            }

            $key = is_string($field['key'] ?? null) && trim((string) $field['key']) !== ''
                ? (string) $field['key']
                : (string) ($field['sourceKey'] ?? 'field');

            $inputType = is_string($field['inputType'] ?? null) ? $field['inputType'] : 'text';
            // Значение задаётся пользователем на токене, а не в шаблоне.
            $rawValue = $rawValues[$key] ?? match ($inputType) {
                'number' => 0,
                'boolean' => false,
                default => '',
            };
            $values[$key] = $this->castByInputType($rawValue, $inputType);
        }

        return $values;
    }

    /**
     * @param array<string, mixed> $template
     * @param array<string, mixed> $computedValues
     * @param array<string, mixed> $values
     *
     * @return array<string, mixed>
     */
    public function injectFormulaValues(array $template, array $computedValues, array $values): array
    {
        $fields = is_array($template['fields'] ?? null) ? $template['fields'] : [];

        foreach ($fields as $field) {
            if (!is_array($field)) {
                continue;
            }

            $kind = is_string($field['kind'] ?? null) ? $field['kind'] : 'local';
            if ($kind !== 'formula') {
                continue;
            }

            $key = is_string($field['key'] ?? null) && trim((string) $field['key']) !== ''
                ? (string) $field['key']
                : (string) ($field['sourceKey'] ?? 'formula');

            $sourceKey = is_string($field['sourceKey'] ?? null) && trim((string) $field['sourceKey']) !== ''
                ? (string) $field['sourceKey']
                : $key;

            $values[$key] = $computedValues[$sourceKey] ?? null;
        }

        return $values;
    }

    public function normalizeKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9_]/', '_', $normalized) ?? '';
        $normalized = preg_replace('/_+/', '_', $normalized) ?? '';
        $normalized = trim($normalized, '_');

        return $normalized !== '' ? $normalized : 'field';
    }

    /**
     * @param array<int, mixed> $tabs
     *
     * @return array<int, array<string, mixed>>
     */
    private function normalizeResources(array $tabs): array
    {
        $resources = [];
        $usedKeys = [];

        foreach ($tabs as $tabIndex => $tab) {
            if (!is_array($tab)) {
                continue;
            }

            $tabName = is_string($tab['name'] ?? null) && trim((string) $tab['name']) !== ''
                ? (string) $tab['name']
                : sprintf('Tab %d', $tabIndex + 1);

            $tabResources = is_array($tab['resources'] ?? null) ? $tab['resources'] : [];
            foreach ($tabResources as $resourceIndex => $resource) {
                if (!is_array($resource)) {
                    continue;
                }

                $name = is_string($resource['name'] ?? null) && trim((string) $resource['name']) !== ''
                    ? trim((string) $resource['name'])
                    : sprintf('Resource %d', $resourceIndex + 1);

                $key = $this->normalizeKey($name);
                if (isset($usedKeys[$key])) {
                    continue;
                }

                $usedKeys[$key] = true;
                $resources[] = [
                    'id' => is_string($resource['id'] ?? null) ? $resource['id'] : sprintf('resource-%d', $resourceIndex + 1),
                    'name' => $name,
                    'key' => $key,
                    'type' => is_string($resource['type'] ?? null) ? $resource['type'] : 'text',
                    'tab' => $tabName,
                ];
            }
        }

        return $resources;
    }

    /**
     * @param array<int, mixed> $formulas
     *
     * @return array<int, array<string, string>>
     */
    private function normalizeFormulas(array $formulas): array
    {
        $result = [];
        $usedKeys = [];

        foreach ($formulas as $index => $formula) {
            if (!is_array($formula)) {
                continue;
            }

            $name = is_string($formula['name'] ?? null) && trim((string) $formula['name']) !== ''
                ? trim((string) $formula['name'])
                : sprintf('Formula %d', $index + 1);

            $key = $this->normalizeKey($name);
            if (isset($usedKeys[$key])) {
                continue;
            }

            $usedKeys[$key] = true;
            $result[] = [
                'id' => is_string($formula['id'] ?? null) ? $formula['id'] : sprintf('formula-%d', $index + 1),
                'name' => $name,
                'key' => $key,
                'expression' => is_string($formula['expression'] ?? null) ? (string) $formula['expression'] : '',
            ];
        }

        return $result;
    }

    /**
     * @param array<int, mixed> $templates
     * @param array<int, string> $resourceKeys
     * @param array<int, string> $formulaKeys
     *
     * @return array<int, array<string, mixed>>
     */
    private function normalizeSheetTemplates(array $templates, array $resourceKeys, array $formulaKeys): array
    {
        $result = [];

        foreach ($templates as $templateIndex => $template) {
            if (!is_array($template)) {
                continue;
            }

            $templateId = is_string($template['id'] ?? null) && trim((string) $template['id']) !== ''
                ? (string) $template['id']
                : sprintf('sheet-template-%d', $templateIndex + 1);

            $templateName = is_string($template['name'] ?? null) && trim((string) $template['name']) !== ''
                ? trim((string) $template['name'])
                : sprintf('Template %d', $templateIndex + 1);

            $templateType = is_string($template['type'] ?? null) ? $template['type'] : 'character';
            if (!in_array($templateType, ['character', 'monster', 'object'], true)) {
                $templateType = 'character';
            }

            $fields = is_array($template['fields'] ?? null) ? $template['fields'] : [];
            $normalizedFields = [];
            foreach ($fields as $fieldIndex => $field) {
                if (!is_array($field)) {
                    continue;
                }

                $kind = is_string($field['kind'] ?? null) ? $field['kind'] : 'local';
                if (!in_array($kind, ['resource', 'formula', 'local'], true)) {
                    $kind = 'local';
                }

                $sourceKey = is_string($field['sourceKey'] ?? null) && trim((string) $field['sourceKey']) !== ''
                    ? $this->normalizeKey((string) $field['sourceKey'])
                    : $this->normalizeKey((string) ($field['key'] ?? sprintf('field_%d', $fieldIndex + 1)));

                if ($kind === 'resource' && !in_array($sourceKey, $resourceKeys, true)) {
                    continue;
                }
                if ($kind === 'formula' && !in_array($sourceKey, $formulaKeys, true)) {
                    continue;
                }

                $inputType = is_string($field['inputType'] ?? null) ? $field['inputType'] : 'text';
                if (!in_array($inputType, ['text', 'number', 'boolean'], true)) {
                    $inputType = 'text';
                }

                $normalizedFields[] = [
                    'id' => is_string($field['id'] ?? null) && trim((string) $field['id']) !== ''
                        ? (string) $field['id']
                        : sprintf('%s-field-%d', $templateId, $fieldIndex + 1),
                    'label' => is_string($field['label'] ?? null) && trim((string) $field['label']) !== ''
                        ? trim((string) $field['label'])
                        : ucfirst(str_replace('_', ' ', $sourceKey)),
                    'key' => is_string($field['key'] ?? null) && trim((string) $field['key']) !== ''
                        ? $this->normalizeKey((string) $field['key'])
                        : $sourceKey,
                    'kind' => $kind,
                    'sourceKey' => $sourceKey,
                    'inputType' => $inputType,
                    'readOnly' => (bool) ($field['readOnly'] ?? false) || $kind === 'formula',
                    'order' => is_numeric($field['order'] ?? null) ? (int) $field['order'] : $fieldIndex,
                ];
            }

            usort($normalizedFields, static function (array $left, array $right): int {
                return ($left['order'] ?? 0) <=> ($right['order'] ?? 0);
            });

            $result[] = [
                'id' => $templateId,
                'name' => $templateName,
                'type' => $templateType,
                'fields' => $normalizedFields,
            ];
        }

        return $result;
    }

    private function castByInputType(mixed $value, string $inputType): mixed
    {
        return match ($inputType) {
            'number' => is_numeric($value) ? (float) $value + 0 : 0,
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOL),
            default => is_scalar($value) ? (string) $value : '',
        };
    }
}
