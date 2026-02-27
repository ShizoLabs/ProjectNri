<?php

namespace App\Document;

use Doctrine\ODM\MongoDB\Mapping\Attribute as ODM;
use App\Repository\SessionRepository;

#[ODM\Document(collection: 'sessions', repositoryClass: SessionRepository::class)]
class Session
{
    #[ODM\Id]
    private ?string $id = null;

    #[ODM\Field(type: 'string')]
    private string $name;

    #[ODM\Field(type: 'date')]
    private \DateTime $createdAt;

    #[ODM\Field(type: 'date')]
    private \DateTime $updatedAt;

    #[ODM\Field(type: 'string')]
    private ?string $workshopSystemId = null;

    public function __construct()
    {
        $now = new \DateTime();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function __toString()
    {
        return $this->getName();
    }

    // ---------- Getters ----------

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getCreatedAt(): \DateTime
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTime
    {
        return $this->updatedAt;
    }

    public function getWorkshopSystemId(): ?string
    {
        return $this->workshopSystemId;
    }

    // ---------- Setters ----------

    public function setName(string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function setWorkshopSystemId(?string $workshopSystemId): self
    {
        $this->workshopSystemId = $workshopSystemId;

        return $this;
    }

    #[ODM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }
}
