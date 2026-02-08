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

    #[ODM\PreUpdate]
    public function onUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }
}
