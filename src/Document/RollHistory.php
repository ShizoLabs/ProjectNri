<?php

namespace App\Document;

use App\Repository\RollHistoryRepository;
use Doctrine\ODM\MongoDB\Mapping\Attribute as ODM;

#[ODM\Document(collection: 'roll_history', repositoryClass: RollHistoryRepository::class)]
#[ODM\Index(keys: ['session_id' => 'asc', 'createdAt' => 'desc'])]
class RollHistory
{
    #[ODM\Id]
    private ?string $id = null;

    #[ODM\Field(name: 'session_id', type: 'string')]
    private string $sessionId;

    #[ODM\Field(type: 'hash')]
    private array $context = [];

    #[ODM\Field(type: 'date')]
    private \DateTime $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTime();
    }

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getSessionId(): string
    {
        return $this->sessionId;
    }

    public function setSessionId(string $sessionId): self
    {
        $this->sessionId = $sessionId;

        return $this;
    }

    public function getContext(): array
    {
        return $this->context;
    }

    public function setContext(array $context): self
    {
        $this->context = $context;

        return $this;
    }

    public function getCreatedAt(): \DateTime
    {
        return $this->createdAt;
    }
}
