<?php

namespace App\Document;

use Doctrine\ODM\MongoDB\Mapping\Attribute as ODM;
use App\Repository\TokenRepository;

#[ODM\Document(collection: 'tokens', repositoryClass: TokenRepository::class)]
class Token
{
    #[ODM\Id]
    private ?string $id = null;

    #[ODM\Field(type: 'string')]
    private string $name;

    #[ODM\Field(type: 'string')]
    private string $type;

    #[ODM\Field(type: 'int')]
    private int $level;

    #[ODM\Field(type: 'int')]
    private int $ownerId;

    #[ODM\Field(type: 'collection')]
    private array $effects = [];

    // Getters
    public function getId(): ?string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function getLevel(): int
    {
        return $this->level;
    }

    public function getOwnerId(): int
    {
        return $this->ownerId;
    }

    public function getEffects(): array
    {
        return $this->effects;
    }

    // Setters
    public function setName(string $name): self
    {
        $this->name = $name;
        return $this;
    }

    public function setType(string $type): self
    {
        $this->type = $type;
        return $this;
    }

    public function setLevel(int $level): self
    {
        $this->level = $level;
        return $this;
    }

    public function setOwnerId(int $ownerId): self
    {
        $this->ownerId = $ownerId;
        return $this;
    }

    public function setEffects(array $effects): self
    {
        $this->effects = $effects;
        return $this;
    }

    // Additional

    public function addEffect(array $effect): self
    {
        $this->effects[] = $effect;
        return $this;
    }

    public function clearEffects(): self
    {
        $this->effects = [];
        return $this;
    }
}
