<?php

namespace App\Workshop\Template;

/** Шаблон для создания dnd5e системы */
class Dnd5eTemplate extends AbstractSystemTemplate
{
    public function getSlug(): string
    {
        return 'dnd5e';
    }

    public function getName(): string
    {
        return 'Dungeons & Dragons 5e';
    }

    public function getResources(): array
    {
        return [
            'strength',
            'dexterity',
            'constitution',
            'intelligence',
            'wisdom',
            'charisma',
            'proficiency',
        ];
    }

    public function getFormulas(): array
    {
        return [
            ['key' => 'strength_mod', 'expression' => 'floor((strength - 10) / 2)'],
            ['key' => 'dexterity_mod', 'expression' => 'floor((dexterity - 10) / 2)'],
            ['key' => 'initiative', 'expression' => 'dexterity_mod'],
            ['key' => 'strength_save', 'expression' => '1d20 + strength_mod + proficiency'],
        ];
    }
}