<?php

namespace App\Workshop\Template;

abstract class AbstractSystemTemplate implements SystemTemplateInterface
{
    public function getResources(): array
    {
        return [];
    }

    public function getAbilities(): array
    {
        return [];
    }

    public function getFormulas(): array
    {
        return [];
    }

    public function getSheetTemplates(): array
    {
        return [];
    }
}
