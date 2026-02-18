<?php

namespace App\Workshop\Template;

interface SystemTemplateInterface
{
    public function getSlug(): string; // dnd5e
    public function getName(): string; // Dungeons & Dragons 5e

    public function getResources(): array;
    public function getFormulas(): array;
}