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
    private string $name = '';

    #[ODM\Field(type: 'int')]
    private int $x = 0;

    #[ODM\Field(type: 'int')]
    private int $y = 0;

    #[ODM\Field(type: 'string')]
    private ?string $sessionId = null;

    #[ODM\Field(type: 'string')]
    private ?string $mapId = null;

    #[ODM\Field(type: 'string')]
    private ?string $templateId = null;

    public function __toString(): string 
    {
        return $this->getName() ?? null;
    }

    // Getters
    public function getId(): ?string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;
        return $this;
    }

    public function getX(): int
    {
        return $this->x;
    }

    public function setX(string $x): self
    {
        $this->x = $x;
        return $this;
    }

    public function getY(): int
    {
        return $this->y;
    }

    public function setY(string $y): self
    {
        $this->y = $y;
        return $this;
    }

    public function getSessionId(): ?string
    {
        return $this->sessionId;
    }

    public function setSessionId(?string $sessionId): self
    {
        $this->sessionId = $sessionId;
        return $this;
    }

    public function getMapId(): ?string
    {
        return $this->mapId;
    }

    public function setMapId(?string $mapId): self
    {
        $this->mapId = $mapId;
        return $this;
    }

    public function getTemplateId(): ?string
    {
        return $this->templateId;
    }

    public function setTemplateId(?string $templateId): self
    {
        $this->templateId = $templateId;
        return $this;
    }
}
