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
    private array $tabs = [];

    #[ODM\Field(type: 'collection')]
    private array $formulas = [];

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

    public function getFormulas(): array
    {
        return $this->formulas;
    }

    public function getMeta(): array
    {
        return $this->meta;
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

    public function validateCollections(): array
    {
        $errors = [];

        if ($this->slug !== null && $this->slug !== '' && !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $this->slug)) {
            $errors[] = 'Slug must use lowercase letters, numbers, and dashes only.';
        }

        if ($this->version < 1) {
            $errors[] = 'Version must be 1 or higher.';
        }

        $resourceIds = [];
        foreach ($this->resources as $index => $resource) {
            if (!is_array($resource)) {
                $errors[] = sprintf('Resource #%d must be an object.', $index + 1);
                continue;
            }

            $id = $resource['id'] ?? null;
            if (!$this->isNonEmptyString($id)) {
                $errors[] = sprintf('Resource #%d requires a non-empty id.', $index + 1);
            } else {
                $resourceIds[] = $id;
            }

            if (!$this->isNonEmptyString($resource['name'] ?? null)) {
                $errors[] = sprintf('Resource #%d requires a name.', $index + 1);
            }

            if (!$this->isNonEmptyString($resource['type'] ?? null)) {
                $errors[] = sprintf('Resource #%d requires a type.', $index + 1);
            }

            if (isset($resource['data']) && !is_array($resource['data'])) {
                $errors[] = sprintf('Resource #%d data must be an object.', $index + 1);
            }
        }

        foreach ($this->tabs as $index => $tab) {
            if (!is_array($tab)) {
                $errors[] = sprintf('Tab #%d must be an object.', $index + 1);
                continue;
            }

            if (!$this->isNonEmptyString($tab['id'] ?? null)) {
                $errors[] = sprintf('Tab #%d requires a non-empty id.', $index + 1);
            }

            if (!$this->isNonEmptyString($tab['name'] ?? null)) {
                $errors[] = sprintf('Tab #%d requires a name.', $index + 1);
            }

            if (isset($tab['elements']) && !is_array($tab['elements'])) {
                $errors[] = sprintf('Tab #%d elements must be a list.', $index + 1);
                continue;
            }

            foreach (($tab['elements'] ?? []) as $elementIndex => $element) {
                if (!is_array($element)) {
                    $errors[] = sprintf('Tab #%d element #%d must be an object.', $index + 1, $elementIndex + 1);
                    continue;
                }

                if (!$this->isNonEmptyString($element['id'] ?? null)) {
                    $errors[] = sprintf('Tab #%d element #%d requires an id.', $index + 1, $elementIndex + 1);
                }

                $resourceId = $element['resourceId'] ?? null;
                if (!$this->isNonEmptyString($resourceId)) {
                    $errors[] = sprintf('Tab #%d element #%d requires a resource id.', $index + 1, $elementIndex + 1);
                } elseif (!empty($resourceIds) && !in_array($resourceId, $resourceIds, true)) {
                    $errors[] = sprintf('Tab #%d element #%d references an unknown resource.', $index + 1, $elementIndex + 1);
                }

                if (isset($element['x']) && !is_numeric($element['x'])) {
                    $errors[] = sprintf('Tab #%d element #%d position X must be numeric.', $index + 1, $elementIndex + 1);
                }

                if (isset($element['y']) && !is_numeric($element['y'])) {
                    $errors[] = sprintf('Tab #%d element #%d position Y must be numeric.', $index + 1, $elementIndex + 1);
                }
            }
        }

        foreach ($this->formulas as $index => $formula) {
            if (!is_array($formula)) {
                $errors[] = sprintf('Formula #%d must be an object.', $index + 1);
                continue;
            }

            if (!$this->isNonEmptyString($formula['id'] ?? null)) {
                $errors[] = sprintf('Formula #%d requires an id.', $index + 1);
            }

            if (!$this->isNonEmptyString($formula['name'] ?? null)) {
                $errors[] = sprintf('Formula #%d requires a name.', $index + 1);
            }

            if (isset($formula['expression']) && !is_string($formula['expression'])) {
                $errors[] = sprintf('Formula #%d expression must be a string.', $index + 1);
            }
        }

        return $errors;
    }

    private function isNonEmptyString(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }

    #[ODM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }
}
