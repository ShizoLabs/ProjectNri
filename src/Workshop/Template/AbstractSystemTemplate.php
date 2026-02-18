<?php

namespace App\Workshop\Template;

abstract class AbstractSystemTemplate implements SystemTemplateInterface
{
    public function getResources(): array
    {
        return [];
    }

    public function getFormulas(): array
    {
        return [];
    }
}
