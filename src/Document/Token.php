<?php

namespace App\Document;

use Doctrine\ODM\MongoDB\Mapping\Attribute as ODM;
use App\Repository\TokenRepository;
use App\Document\TokenType;

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

    #[ODM\Field(type: 'int')]
    private int $sizeX = 50;

    #[ODM\Field(type: 'int')]
    private int $sizeY = 50;

    #[ODM\Field(type: 'int')]
    private int $rotation = 0;

    #[ODM\Field(type: 'string')]
    private ?string $imagePath = null;

    #[ODM\Field(type: 'string')]
    private ?string $sessionId = null;

    #[ODM\Field(type: 'string')]
    private ?string $mapId = null;

    #[ODM\Field(type: 'string')]
    private ?string $templateId = null;

    #[ODM\ReferenceOne(targetDocument: TokenType::class, inversedBy: 'tokens')]
    private ?TokenType $tokenType = null;

    public function __toString(): string 
    {
        return $this->getName();
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

    public function setX(int $x): self
    {
        $this->x = $x;
        return $this;
    }

    public function getY(): int
    {
        return $this->y;
    }

    public function setY(int $y): self
    {
        $this->y = $y;
        return $this;
    }

    public function getSizeX(): int
    {
        return $this->sizeX;
    }

    public function setSizeX(int $sizeX): self
    {
        $this->sizeX = $sizeX;
        return $this;
    }

    public function getSizeY(): int
    {
        return $this->sizeY;
    }

    public function setSizeY(int $sizeY): self
    {
        $this->sizeY = $sizeY;
        return $this;
    }

    public function getRotation(): int
    {
        return $this->rotation;
    }

    public function setRotation(int $rotation): self
    {
        $this->rotation = $rotation;
        return $this;
    }

    public function getImagePath(): ?string
    {
        return $this->imagePath;
    }

    public function setImagePath(?string $imagePath): self
    {
        $this->imagePath = $imagePath;
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

    public function getTokenType(): ?TokenType
    {
        return $this->tokenType;
    }

    public function setTokenType(?TokenType $tokenType): self
    {
        $this->tokenType = $tokenType;
        return $this;
    }
}
