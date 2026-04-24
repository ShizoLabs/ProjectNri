<?php

namespace App\Workshop\Installer;

use Doctrine\ODM\MongoDB\DocumentManager;
use App\Workshop\Template\SystemTemplateInterface;
use App\Document\WorkshopSystem;
/**
 * Установщик систем по шаблону.
 *
 * Задача класса:
 * - взять "сырой" шаблон (`SystemTemplateInterface`);
 * - привести его к единому внутреннему формату `WorkshopSystem`;
 * - записать документ в MongoDB.
 *
 * Важно:
 * - методы `build*` выполняют нормализацию и защиту от неполных/некорректных данных;
 * - на выходе всегда формируется консистентная структура, пригодная для UI и валидации.
 */
class SystemInstaller
{
    public function __construct(
        private DocumentManager $dm
    ) {}

    /**
     * Устанавливает систему из шаблона в документ `WorkshopSystem`.
     *
     * @param SystemTemplateInterface $template Источник данных (slug, name, resources, formulas, sheet templates).
     * @param WorkshopSystem|null $system Целевой документ. Если `null`, создаётся новый.
     * @param string|null $name Кастомное имя системы. Если пусто/`null`, берём имя из шаблона.
     * @param string|null $slug Кастомный slug. Если пусто/`null`, берём slug из шаблона и нормализуем.
     *
     * @return WorkshopSystem Сохранённый документ системы.
     */
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
        $mainTabId = $this->createId('tab');

        $resources = $this->buildResources($template->getResources(), $mainTabId);
        $abilities = $this->buildAbilities($template->getAbilities(), $mainTabId);
        $formulaTabId = count($template->getFormulas()) > 0 ? $this->createId('tab') : null;
        $formulas = $this->buildFormulas($template->getFormulas(), $formulaTabId ?? $mainTabId);
        $sheetTemplates = $this->buildSheetTemplates($template->getSheetTemplates(), $resources, $formulas);

        $system
            ->setName($resolvedName !== '' ? $resolvedName : $template->getName())
            ->setSlug($resolvedSlug !== '' ? $resolvedSlug : $template->getSlug())
            ->setSettings([])
            ->setTabs($this->buildTabs($mainTabId, $resources, $abilities, $formulaTabId, $formulas))
            ->setResources($resources)
            ->setAbilities($abilities)
            ->setFormulas($formulas)
            ->setSheetTemplates($sheetTemplates)
            ->setMeta([]);

        $this->dm->persist($system);
        $this->dm->flush();

        return $system;
    }

    /**
     * Нормализует массив ресурсов шаблона в внутренний формат системы.
     *
     * Поддерживаемые форматы входного элемента:
     * - `string`: трактуется как ключ/имя ресурса (например `strength`);
     * - `array`: можно передать `name`, `key`, `type`.
     *
     * Выходной элемент ресурса:
     * - `id` (string)          уникальный id ресурса;
     * - `name` (string)        отображаемое имя ресурса;
     * - `type` (string)        тип ресурса (например text/number/boolean);
     * - `tabId` (string)       id вкладки, к которой привязан ресурс;
     * - `column` (int 0|1)     колонка на вкладке;
     * - `order` (int)          порядок отображения.
     */
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

    /**
     * Нормализует способности шаблона в внутренний формат системы.
     *
     * Поддерживаемые ключи массива:
     * - `name`/`key`
     * - `description`
     * - `unlock_condition`
     * - `use_condition`
     * - `trigger_condition`
     * - `type` (`active` | `passive` | `special`)
     * - `grants`
     * - `icon`
     */
    private function buildAbilities(array $abilities, string $tabId): array
    {
        $normalized = [];

        foreach ($abilities as $index => $ability) {
            $safe = is_array($ability) ? $ability : [];
            $name = is_string($ability)
                ? $this->humanize($ability)
                : (string) ($safe['name'] ?? $safe['key'] ?? sprintf('Ability %d', $index + 1));
            $type = is_string($safe['type'] ?? null) && in_array($safe['type'], ['active', 'passive', 'special'], true)
                ? $safe['type']
                : 'active';

            $normalized[] = [
                'id' => $this->createId('ability'),
                'name' => trim($name) !== '' ? trim($name) : sprintf('Ability %d', $index + 1),
                'description' => is_string($safe['description'] ?? null) ? $safe['description'] : '',
                'unlock_condition' => is_string($safe['unlock_condition'] ?? null) ? $safe['unlock_condition'] : '',
                'use_condition' => is_string($safe['use_condition'] ?? null) ? $safe['use_condition'] : '',
                'trigger_condition' => is_string($safe['trigger_condition'] ?? null) ? $safe['trigger_condition'] : '',
                'type' => $type,
                'grants' => is_string($safe['grants'] ?? null) ? $safe['grants'] : '',
                'icon' => is_string($safe['icon'] ?? null) ? $safe['icon'] : '',
                'tabId' => $tabId,
                'column' => 0,
                'order' => $index,
            ];
        }

        return $normalized;
    }

    /**
     * Нормализует формулы шаблона в внутренний формат системы.
     *
     * Ожидаемый входной элемент:
     * - массив с `name` или `key`, и `expression`.
     *
     * Если элемент не массив, он пропускается.
     * Если имя пустое, формируется дефолт `Formula N`.
     */
    private function buildFormulas(array $formulas, string $tabId): array
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
                'tabId' => $tabId,
                'column' => 0,
                'order' => $index,
            ];
        }

        return $normalized;
    }

    /**
     * @param array<int, array<string, mixed>> $resources
     * @param array<int, array<string, mixed>> $abilities
     * @param array<int, array<string, mixed>> $formulas
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildTabs(
        string $mainTabId,
        array $resources,
        array $abilities,
        ?string $formulaTabId,
        array $formulas
    ): array {
        $tabs = [[
            'id' => $mainTabId,
            'name' => 'Main',
            'order' => 0,
            'resources' => $this->buildTabResources($resources),
            'abilities' => $this->buildTabAbilities($abilities),
            'formulas' => [],
        ]];

        if ($formulaTabId !== null) {
            $tabs[] = [
                'id' => $formulaTabId,
                'name' => 'Formulas',
                'order' => 1,
                'resources' => [],
                'abilities' => [],
                'formulas' => $this->buildTabFormulas($formulas),
            ];
        }

        return $tabs;
    }

    /**
     * @param array<int, array<string, mixed>> $resources
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildTabResources(array $resources): array
    {
        return array_map(
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
    }

    /**
     * @param array<int, array<string, mixed>> $abilities
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildTabAbilities(array $abilities): array
    {
        return array_map(
            static fn (array $ability): array => [
                'id' => $ability['id'],
                'name' => $ability['name'],
                'type' => $ability['type'],
                'position' => [
                    'column' => $ability['column'],
                    'order' => $ability['order'],
                ],
            ],
            $abilities
        );
    }

    /**
     * @param array<int, array<string, mixed>> $formulas
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildTabFormulas(array $formulas): array
    {
        return array_map(
            static fn (array $formula): array => [
                'id' => $formula['id'],
                'name' => $formula['name'],
                'expression' => $formula['expression'],
                'position' => [
                    'column' => $formula['column'],
                    'order' => $formula['order'],
                ],
            ],
            $formulas
        );
    }

    /**
     * Формирует стартовые шаблоны листов токена для выбранной системы.
     *
     * Вход:
     * - `$templates` из `SystemTemplateInterface::getSheetTemplates()`;
     * - уже нормализованные `$resources` и `$formulas`.
     *
     * Логика:
     * 1) Строим набор допустимых `sourceKey` для `resource` и `formula`.
     * 2) Нормализуем каждый шаблон и каждое поле.
     * 3) Поля с невалидной ссылкой (`resource`/`formula`) отбрасываем.
     *
     * Поддерживаемые значения поля:
     * - `kind`: `resource` | `formula` | `local` (иначе -> `local`);
     * - `inputType`: `text` | `number` | `boolean` (иначе -> `text`).
     *
     * Выходной формат шаблона листа:
     * - `id`, `name`, `fields`.
     *
     * Выходной формат поля:
     * - `id`, `label`, `kind`, `sourceKey`, `key`, `inputType`, `readOnly`, `order`.
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
                'fields' => $normalizedFields,
            ];
        }

        return $result;
    }

    /**
     * Преобразует slug-подобную строку в читаемое имя:
     * `hit_points` -> `Hit points`.
     */
    private function humanize(string $value): string
    {
        $value = str_replace(['-', '_'], ' ', trim($value));
        $value = preg_replace('/\s+/', ' ', $value) ?? $value;

        return ucfirst(strtolower($value));
    }

    /**
     * Нормализует slug:
     * - lower-case;
     * - любые не [a-z0-9] заменяются на '-';
     * - лишние '-' по краям удаляются.
     */
    private function normalizeSlug(string $slug): string
    {
        $slug = strtolower(trim($slug));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';

        return trim($slug, '-');
    }

    /**
     * Нормализует произвольное имя в ключ:
     * - lower_snake_case;
     * - недопустимые символы -> `_`;
     * - повторяющиеся `_` схлопываются.
     *
     * Если после нормализации ключ пустой, возвращает `field`.
     */
    private function normalizeKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9_]/', '_', $normalized) ?? '';
        $normalized = preg_replace('/_+/', '_', $normalized) ?? '';
        $normalized = trim($normalized, '_');

        return $normalized !== '' ? $normalized : 'field';
    }

    /**
     * Генерирует id с заданным префиксом.
     *
     * Предпочитает криптографически стойкий random_bytes, с fallback на uniqid.
     */
    private function createId(string $prefix): string
    {
        try {
            return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
        } catch (\Throwable) {
            return sprintf('%s-%s', $prefix, uniqid('', true));
        }
    }
}
