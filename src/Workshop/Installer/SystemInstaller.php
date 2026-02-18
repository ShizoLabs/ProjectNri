<?php

namespace App\Workshop\Installer;

use Doctrine\ODM\MongoDB\DocumentManager;
use App\Workshop\Template\SystemTemplateInterface;
use App\Document\WorkshopSystem;
/** Установщик систем. Нужен для ручной установки систем на установку */
class SystemInstaller
{
    public function __construct(
        private DocumentManager $dm
    ) {}

    public function install(
        SystemTemplateInterface $template,
        ?WorkshopSystem $system = null,
        ?string $name = null,
        ?string $slug = null
    ): WorkshopSystem
    {
        $system ??= new WorkshopSystem();

        $resolvedName = trim($name ?? $template->getName());
        $resolvedSlug = $this->normalizeSlug($slug ?? $template->getSlug());
        $tabId = $this->createId('tab');

        $resources = $this->buildResources($template->getResources(), $tabId);
        $formulas = $this->buildFormulas($template->getFormulas());
        $sheetTemplates = $this->buildSheetTemplates($template->getSheetTemplates(), $resources, $formulas);
        $tabResources = array_map(
            static fn (array $resource): array => [
                'id' => $resource['id'],
                'name' => $resource['name'],
                'type' => $resource['type'],
                'position' => [
                    'column' => $resource['column'],
                    'order' => $resource['order'],
                ],
            ],
            $resources
        );

        $system
            ->setName($resolvedName !== '' ? $resolvedName : $template->getName())
            ->setSlug($resolvedSlug !== '' ? $resolvedSlug : $template->getSlug())
            ->setSettings([])
            ->setTabs([[
                'id' => $tabId,
                'name' => 'Main',
                'order' => 0,
                'resources' => $tabResources,
            ]])
            ->setResources($resources)
            ->setFormulas($formulas)
            ->setSheetTemplates($sheetTemplates)
            ->setMeta([]);

        $this->dm->persist($system);
        $this->dm->flush();

        return $system;
    }

    private function buildResources(array $resources, string $tabId): array
    {
        $normalized = [];

        foreach ($resources as $index => $resource) {
            $name = is_string($resource)
                ? $this->humanize($resource)
                : (string) ($resource['name'] ?? $resource['key'] ?? sprintf('Resource %d', $index + 1));
            $type = is_array($resource) && is_string($resource['type'] ?? null)
                ? $resource['type']
                : (is_string($resource) ? 'number' : 'text');

            $normalized[] = [
                'id' => $this->createId('res'),
                'name' => trim($name) !== '' ? trim($name) : sprintf('Resource %d', $index + 1),
                'type' => $type,
                'tabId' => $tabId,
                'column' => 0,
                'order' => $index,
            ];
        }

        return $normalized;
    }

    private function buildFormulas(array $formulas): array
    {
        $normalized = [];

        foreach ($formulas as $index => $formula) {
            if (!is_array($formula)) {
                continue;
            }

            $name = (string) ($formula['name'] ?? $formula['key'] ?? sprintf('Formula %d', $index + 1));
            $expression = (string) ($formula['expression'] ?? '');

            $normalized[] = [
                'id' => $this->createId('formula'),
                'name' => trim($name) !== '' ? trim($name) : sprintf('Formula %d', $index + 1),
                'expression' => $expression,
            ];
        }

        return $normalized;
    }

    /**
     * Формируем стартовые шаблоны листов токена для выбранной системы.
     */
    private function buildSheetTemplates(array $templates, array $resources, array $formulas): array
    {
        $resourceKeys = [];
        foreach ($resources as $resource) {
            $resourceKeys[] = $this->normalizeKey((string) ($resource['name'] ?? 'resource'));
        }
        $resourceKeys = array_values(array_unique($resourceKeys));

        $formulaKeys = [];
        foreach ($formulas as $index => $formula) {
            $name = (string) ($formula['name'] ?? sprintf('Formula %d', $index + 1));
            $formulaKeys[] = $this->normalizeKey($name);
        }
        $formulaKeys = array_values(array_unique($formulaKeys));

        $result = [];
        foreach ($templates as $templateIndex => $template) {
            if (!is_array($template)) {
                continue;
            }

            $name = trim((string) ($template['name'] ?? sprintf('Template %d', $templateIndex + 1)));
            $type = (string) ($template['type'] ?? 'character');
            if (!in_array($type, ['character', 'monster', 'object'], true)) {
                $type = 'character';
            }

            $normalizedFields = [];
            $fields = is_array($template['fields'] ?? null) ? $template['fields'] : [];
            foreach ($fields as $fieldIndex => $field) {
                if (!is_array($field)) {
                    continue;
                }

                $kind = (string) ($field['kind'] ?? 'local');
                if (!in_array($kind, ['resource', 'formula', 'local'], true)) {
                    $kind = 'local';
                }

                $sourceKey = $this->normalizeKey((string) ($field['sourceKey'] ?? $field['key'] ?? sprintf('field_%d', $fieldIndex + 1)));
                if ($kind === 'resource' && !in_array($sourceKey, $resourceKeys, true)) {
                    continue;
                }
                if ($kind === 'formula' && !in_array($sourceKey, $formulaKeys, true)) {
                    continue;
                }

                $inputType = (string) ($field['inputType'] ?? ($kind === 'formula' ? 'number' : 'text'));
                if (!in_array($inputType, ['text', 'number', 'boolean'], true)) {
                    $inputType = 'text';
                }

                $normalizedFields[] = [
                    'id' => $this->createId('sheet-field'),
                    'label' => trim((string) ($field['label'] ?? ucfirst(str_replace('_', ' ', $sourceKey)))) ?: 'Field',
                    'kind' => $kind,
                    'sourceKey' => $sourceKey,
                    'key' => $sourceKey,
                    'inputType' => $inputType,
                    'readOnly' => $kind === 'formula',
                    'order' => $fieldIndex,
                ];
            }

            $result[] = [
                'id' => $this->createId('sheet-template'),
                'name' => $name !== '' ? $name : sprintf('Template %d', $templateIndex + 1),
                'type' => $type,
                'fields' => $normalizedFields,
            ];
        }

        return $result;
    }

    private function humanize(string $value): string
    {
        $value = str_replace(['-', '_'], ' ', trim($value));
        $value = preg_replace('/\s+/', ' ', $value) ?? $value;

        return ucfirst(strtolower($value));
    }

    private function normalizeSlug(string $slug): string
    {
        $slug = strtolower(trim($slug));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';

        return trim($slug, '-');
    }

    private function normalizeKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9_]/', '_', $normalized) ?? '';
        $normalized = preg_replace('/_+/', '_', $normalized) ?? '';
        $normalized = trim($normalized, '_');

        return $normalized !== '' ? $normalized : 'field';
    }

    private function createId(string $prefix): string
    {
        try {
            return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
        } catch (\Throwable) {
            return sprintf('%s-%s', $prefix, uniqid('', true));
        }
    }
}
