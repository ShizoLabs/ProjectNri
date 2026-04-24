<?php

namespace App\Document;

use App\Repository\WorkshopSystemRepository;
use Doctrine\ODM\MongoDB\Mapping\Attribute as ODM;

#[ODM\Document(collection: 'workshop_systems', repositoryClass: WorkshopSystemRepository::class)]
class WorkshopSystem
{
    #[ODM\Id]
    private ?string $id = null;

    #[ODM\Field(type: 'string')]
    private string $name;

    #[ODM\Field(type: 'string')]
    private ?string $slug = null;

    #[ODM\Field(type: 'int')]
    private int $version = 1;

    #[ODM\Field(type: 'hash')]
    private array $settings = [];

    #[ODM\Field(type: 'collection')]
    private array $resources = [];

    #[ODM\Field(type: 'collection')]
    private array $abilities = [];

    #[ODM\Field(type: 'collection')]
    private array $tabs = [];

    #[ODM\Field(type: 'collection')]
    private array $formulas = [];

    #[ODM\Field(type: 'collection')]
    private array $sheetTemplates = [];

    #[ODM\Field(type: 'hash')]
    private array $meta = [];

    #[ODM\Field(type: 'date')]
    private \DateTime $createdAt;

    #[ODM\Field(type: 'date')]
    private \DateTime $updatedAt;

    public function __construct()
    {
        $now = new \DateTime();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function __toString(): string
    {
        return $this->getName();
    }

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getSlug(): ?string
    {
        return $this->slug;
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    public function getSettings(): array
    {
        return $this->settings;
    }

    public function getResources(): array
    {
        return $this->resources;
    }

    public function getTabs(): array
    {
        return $this->tabs;
    }

    public function getAbilities(): array
    {
        return $this->abilities;
    }

    public function getFormulas(): array
    {
        return $this->formulas;
    }

    public function getMeta(): array
    {
        return $this->meta;
    }

    public function getSheetTemplates(): array
    {
        return $this->sheetTemplates;
    }

    public function getCreatedAt(): \DateTime
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTime
    {
        return $this->updatedAt;
    }

    public function setName(string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function setSlug(?string $slug): self
    {
        $this->slug = $slug;

        return $this;
    }

    public function setVersion(int $version): self
    {
        $this->version = $version;

        return $this;
    }

    public function setSettings(array $settings): self
    {
        $this->settings = $settings;

        return $this;
    }

    public function setResources(array $resources): self
    {
        $this->resources = $resources;

        return $this;
    }

    public function setAbilities(array $abilities): self
    {
        $this->abilities = $abilities;

        return $this;
    }

    public function setTabs(array $tabs): self
    {
        $this->tabs = $tabs;

        return $this;
    }

    public function setFormulas(array $formulas): self
    {
        $this->formulas = $formulas;

        return $this;
    }

    public function setMeta(array $meta): self
    {
        $this->meta = $meta;

        return $this;
    }

    public function setSheetTemplates(array $sheetTemplates): self
    {
        $this->sheetTemplates = $sheetTemplates;

        return $this;
    }

    public function ensureDefaultTab(): void
    {
        if (!empty($this->tabs)) {
            return;
        }

        $this->tabs = [[
            'id' => $this->generateTabId(),
            'name' => 'Tab 1',
            'order' => 0,
            'resources' => [],
            'abilities' => [],
            'formulas' => [],
        ]];
    }

    public function validateCollections(): array
    {
        $errors = [];

        if ($this->slug !== null && $this->slug !== '' && !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $this->slug)) {
            $errors[] = 'Slug must use lowercase letters, numbers, and dashes only.';
        }

        if ($this->version < 1) {
            $errors[] = 'Version must be 1 or higher.';
        }

        if (empty($this->tabs)) {
            $errors[] = 'At least one tab is required.';
        }

        $tabIds = [];
        foreach ($this->tabs as $index => $tab) {
            if (!is_array($tab)) {
                $errors[] = sprintf('Tab #%d must be an object.', $index + 1);
                continue;
            }

            if (!$this->isNonEmptyString($tab['id'] ?? null)) {
                $errors[] = sprintf('Tab #%d requires a non-empty id.', $index + 1);
            } else {
                $tabIds[] = $tab['id'];
            }

            if (!$this->isNonEmptyString($tab['name'] ?? null)) {
                $errors[] = sprintf('Tab #%d requires a name.', $index + 1);
            }

            foreach (['resources', 'abilities', 'formulas'] as $field) {
                if (isset($tab[$field]) && !is_array($tab[$field])) {
                    $errors[] = sprintf('Tab #%d %s must be a list.', $index + 1, $field);
                }
            }

            $errors = array_merge(
                $errors,
                $this->validateTabItems(
                    is_array($tab['resources'] ?? null) ? $tab['resources'] : [],
                    $index + 1,
                    'resource',
                    true
                ),
                $this->validateTabItems(
                    is_array($tab['abilities'] ?? null) ? $tab['abilities'] : [],
                    $index + 1,
                    'ability',
                    true,
                    false,
                    ['active', 'passive', 'special']
                ),
                $this->validateTabItems(
                    is_array($tab['formulas'] ?? null) ? $tab['formulas'] : [],
                    $index + 1,
                    'formula',
                    false,
                    true
                )
            );
        }

        $errors = array_merge(
            $errors,
            $this->validatePlacedItems($this->resources, 'Resource', $tabIds, true),
            $this->validatePlacedItems(
                $this->abilities,
                'Ability',
                $tabIds,
                true,
                false,
                ['active', 'passive', 'special'],
                ['description', 'unlock_condition', 'use_condition', 'trigger_condition', 'grants', 'icon']
            ),
            $this->validatePlacedItems($this->formulas, 'Formula', $tabIds, false, true)
        );

        $errors = array_merge($errors, $this->validateSheetTemplates());

        return $errors;
    }

    /**
     * @param array<int, mixed> $items
     * @param array<int, string> $allowedTypes
     *
     * @return array<int, string>
     */
    private function validateTabItems(
        array $items,
        int $tabNumber,
        string $itemLabel,
        bool $requiresType,
        bool $requiresExpression = false,
        array $allowedTypes = []
    ): array {
        $errors = [];

        foreach ($items as $itemIndex => $item) {
            $context = sprintf('Tab #%d %s #%d', $tabNumber, $itemLabel, $itemIndex + 1);
            $errors = array_merge(
                $errors,
                $this->validatePositionedItem($item, $context, $requiresType, $requiresExpression, $allowedTypes, [], true)
            );
        }

        return $errors;
    }

    /**
     * @param array<int, mixed> $items
     * @param array<int, string> $tabIds
     * @param array<int, string> $allowedTypes
     * @param array<int, string> $stringFields
     *
     * @return array<int, string>
     */
    private function validatePlacedItems(
        array $items,
        string $label,
        array $tabIds,
        bool $requiresType,
        bool $requiresExpression = false,
        array $allowedTypes = [],
        array $stringFields = []
    ): array {
        $errors = [];

        foreach ($items as $index => $item) {
            $context = sprintf('%s #%d', $label, $index + 1);
            $errors = array_merge(
                $errors,
                $this->validatePositionedItem($item, $context, $requiresType, $requiresExpression, $allowedTypes, $stringFields)
            );

            if (!is_array($item)) {
                continue;
            }

            if (!$this->isNonEmptyString($item['tabId'] ?? null)) {
                $errors[] = sprintf('%s requires a tab id.', $context);
            } elseif (!empty($tabIds) && !in_array((string) $item['tabId'], $tabIds, true)) {
                $errors[] = sprintf('%s references an unknown tab.', $context);
            }

            $column = $item['column'] ?? null;
            if (!is_int($column) && !is_numeric($column)) {
                $errors[] = sprintf('%s column must be numeric.', $context);
            } elseif ((int) $column < 0 || (int) $column > 1) {
                $errors[] = sprintf('%s column must be 0 or 1.', $context);
            }

            $order = $item['order'] ?? null;
            if (!is_int($order) && !is_numeric($order)) {
                $errors[] = sprintf('%s order must be numeric.', $context);
            }
        }

        return $errors;
    }

    /**
     * @param array<int, string> $allowedTypes
     * @param array<int, string> $stringFields
     *
     * @return array<int, string>
     */
    private function validatePositionedItem(
        mixed $item,
        string $context,
        bool $requiresType,
        bool $requiresExpression = false,
        array $allowedTypes = [],
        array $stringFields = [],
        bool $requiresPosition = false
    ): array {
        $errors = [];

        if (!is_array($item)) {
            return [sprintf('%s must be an object.', $context)];
        }

        if (!$this->isNonEmptyString($item['id'] ?? null)) {
            $errors[] = sprintf('%s requires an id.', $context);
        }

        if (!$this->isNonEmptyString($item['name'] ?? null)) {
            $errors[] = sprintf('%s requires a name.', $context);
        }

        if ($requiresType) {
            $type = $item['type'] ?? null;
            if (!$this->isNonEmptyString($type)) {
                $errors[] = sprintf('%s requires a type.', $context);
            } elseif ($allowedTypes !== [] && !in_array((string) $type, $allowedTypes, true)) {
                $errors[] = sprintf('%s type must be one of: %s.', $context, implode(', ', $allowedTypes));
            }
        }

        if ($requiresExpression && isset($item['expression']) && !is_string($item['expression'])) {
            $errors[] = sprintf('%s expression must be a string.', $context);
        }

        foreach ($stringFields as $field) {
            if (isset($item[$field]) && !is_string($item[$field])) {
                $errors[] = sprintf('%s %s must be a string.', $context, str_replace('_', ' ', $field));
            }
        }

        if ($requiresPosition || array_key_exists('position', $item)) {
            $position = $item['position'] ?? null;
            if (!is_array($position)) {
                $errors[] = sprintf('%s requires a position.', $context);
            } else {
                $column = $position['column'] ?? null;
                if (!is_int($column) && !is_numeric($column)) {
                    $errors[] = sprintf('%s position column must be numeric.', $context);
                } elseif ((int) $column < 0 || (int) $column > 1) {
                    $errors[] = sprintf('%s position column must be 0 or 1.', $context);
                }

                $order = $position['order'] ?? null;
                if (!is_int($order) && !is_numeric($order)) {
                    $errors[] = sprintf('%s position order must be numeric.', $context);
                }
            }
        }

        return $errors;
    }

    public function validateSheetTemplates(): array
    {
        $errors = [];
        $resourceKeys = $this->buildResourceKeysFromTabs();
        $formulaKeys = $this->buildFormulaKeys();
        $templateIds = [];

        foreach ($this->sheetTemplates as $templateIndex => $template) {
            if (!is_array($template)) {
                $errors[] = sprintf('Sheet template #%d must be an object.', $templateIndex + 1);
                continue;
            }

            if (!$this->isNonEmptyString($template['id'] ?? null)) {
                $errors[] = sprintf('Sheet template #%d requires an id.', $templateIndex + 1);
            } else {
                $templateIds[] = $template['id'];
            }

            if (!$this->isNonEmptyString($template['name'] ?? null)) {
                $errors[] = sprintf('Sheet template #%d requires a name.', $templateIndex + 1);
            }

            if (isset($template['fields']) && !is_array($template['fields'])) {
                $errors[] = sprintf('Sheet template #%d fields must be a list.', $templateIndex + 1);
                continue;
            }

            foreach (($template['fields'] ?? []) as $fieldIndex => $field) {
                if (!is_array($field)) {
                    $errors[] = sprintf('Sheet template #%d field #%d must be an object.', $templateIndex + 1, $fieldIndex + 1);
                    continue;
                }

                if (!$this->isNonEmptyString($field['id'] ?? null)) {
                    $errors[] = sprintf('Sheet template #%d field #%d requires an id.', $templateIndex + 1, $fieldIndex + 1);
                }

                if (!$this->isNonEmptyString($field['label'] ?? null)) {
                    $errors[] = sprintf('Sheet template #%d field #%d requires a label.', $templateIndex + 1, $fieldIndex + 1);
                }

                if (!$this->isNonEmptyString($field['key'] ?? null)) {
                    $errors[] = sprintf('Sheet template #%d field #%d requires a key.', $templateIndex + 1, $fieldIndex + 1);
                }

                $fieldKind = $field['kind'] ?? null;
                if (!$this->isNonEmptyString($fieldKind) || !in_array($fieldKind, ['resource', 'formula', 'local'], true)) {
                    $errors[] = sprintf('Sheet template #%d field #%d kind must be resource, formula, or local.', $templateIndex + 1, $fieldIndex + 1);
                    continue;
                }

                $sourceKey = $field['sourceKey'] ?? null;
                if ($fieldKind === 'resource') {
                    if (!$this->isNonEmptyString($sourceKey) || !in_array((string) $sourceKey, $resourceKeys, true)) {
                        $errors[] = sprintf('Sheet template #%d field #%d resource source is invalid.', $templateIndex + 1, $fieldIndex + 1);
                    }
                }

                if ($fieldKind === 'formula') {
                    if (!$this->isNonEmptyString($sourceKey) || !in_array((string) $sourceKey, $formulaKeys, true)) {
                        $errors[] = sprintf('Sheet template #%d field #%d formula source is invalid.', $templateIndex + 1, $fieldIndex + 1);
                    }
                }

                $inputType = $field['inputType'] ?? null;
                if (
                    $inputType !== null
                    && (!$this->isNonEmptyString($inputType) || !in_array($inputType, ['text', 'number', 'boolean'], true))
                ) {
                    $errors[] = sprintf('Sheet template #%d field #%d input type must be text, number, or boolean.', $templateIndex + 1, $fieldIndex + 1);
                }
            }
        }

        if (count($templateIds) !== count(array_unique($templateIds))) {
            $errors[] = 'Sheet templates require unique ids.';
        }

        return $errors;
    }

    // Нормализуем ключ так же, как в формульном движке, чтобы ссылки совпадали.
    private function normalizeKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9_]/', '_', $normalized) ?? '';
        $normalized = preg_replace('/_+/', '_', $normalized) ?? '';
        $normalized = trim($normalized, '_');

        return $normalized !== '' ? $normalized : 'var';
    }

    // Собираем ключи ресурсов из вкладок системы.
    private function buildResourceKeysFromTabs(): array
    {
        $keys = [];
        foreach ($this->tabs as $tab) {
            if (!is_array($tab) || !is_array($tab['resources'] ?? null)) {
                continue;
            }

            foreach ($tab['resources'] as $resource) {
                if (!is_array($resource)) {
                    continue;
                }

                $name = $resource['name'] ?? null;
                if (!$this->isNonEmptyString($name)) {
                    continue;
                }

                $keys[] = $this->normalizeKey((string) $name);
            }
        }

        return array_values(array_unique($keys));
    }

    // Собираем ключи формул из имени формулы.
    private function buildFormulaKeys(): array
    {
        $keys = [];
        foreach ($this->formulas as $index => $formula) {
            if (!is_array($formula)) {
                continue;
            }

            $name = $formula['name'] ?? null;
            if (!$this->isNonEmptyString($name)) {
                $name = sprintf('Formula %d', $index + 1);
            }

            $keys[] = $this->normalizeKey((string) $name);
        }

        return array_values(array_unique($keys));
    }

    private function isNonEmptyString(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }

    private function generateTabId(): string
    {
        try {
            return 'tab-' . bin2hex(random_bytes(6));
        } catch (\Throwable $e) {
            return 'tab-' . uniqid('', true);
        }
    }

    #[ODM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }
}
