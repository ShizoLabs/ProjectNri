<?php

namespace App\Workshop\Installer;

use Doctrine\ODM\MongoDB\DocumentManager;
use App\Workshop\Template\SystemTemplateInterface;
use App\Document\WorkshopSystem;
/** Установщик систем. Нужен для ручной установки систем на установку */
class SystemInstaller
{
    public function __construct(
        private DocumentManager $dm
    ) {}

    public function install(
        SystemTemplateInterface $template,
        ?WorkshopSystem $system = null,
        ?string $name = null,
        ?string $slug = null
    ): WorkshopSystem
    {
        $system ??= new WorkshopSystem();

        $resolvedName = trim($name ?? $template->getName());
        $resolvedSlug = $this->normalizeSlug($slug ?? $template->getSlug());
        $tabId = $this->createId('tab');

        $resources = $this->buildResources($template->getResources(), $tabId);
        $formulas = $this->buildFormulas($template->getFormulas());
        $tabResources = array_map(
            static fn (array $resource): array => [
                'id' => $resource['id'],
                'name' => $resource['name'],
                'type' => $resource['type'],
                'position' => [
                    'column' => $resource['column'],
                    'order' => $resource['order'],
                ],
            ],
            $resources
        );

        $system
            ->setName($resolvedName !== '' ? $resolvedName : $template->getName())
            ->setSlug($resolvedSlug !== '' ? $resolvedSlug : $template->getSlug())
            ->setSettings([])
            ->setTabs([[
                'id' => $tabId,
                'name' => 'Main',
                'order' => 0,
                'resources' => $tabResources,
            ]])
            ->setResources($resources)
            ->setFormulas($formulas)
            ->setMeta([]);

        $this->dm->persist($system);
        $this->dm->flush();

        return $system;
    }

    private function buildResources(array $resources, string $tabId): array
    {
        $normalized = [];

        foreach ($resources as $index => $resource) {
            $name = is_string($resource)
                ? $this->humanize($resource)
                : (string) ($resource['name'] ?? $resource['key'] ?? sprintf('Resource %d', $index + 1));
            $type = is_array($resource) && is_string($resource['type'] ?? null)
                ? $resource['type']
                : (is_string($resource) ? 'number' : 'text');

            $normalized[] = [
                'id' => $this->createId('res'),
                'name' => trim($name) !== '' ? trim($name) : sprintf('Resource %d', $index + 1),
                'type' => $type,
                'tabId' => $tabId,
                'column' => 0,
                'order' => $index,
            ];
        }

        return $normalized;
    }

    private function buildFormulas(array $formulas): array
    {
        $normalized = [];

        foreach ($formulas as $index => $formula) {
            if (!is_array($formula)) {
                continue;
            }

            $name = (string) ($formula['name'] ?? $formula['key'] ?? sprintf('Formula %d', $index + 1));
            $expression = (string) ($formula['expression'] ?? '');

            $normalized[] = [
                'id' => $this->createId('formula'),
                'name' => trim($name) !== '' ? trim($name) : sprintf('Formula %d', $index + 1),
                'expression' => $expression,
            ];
        }

        return $normalized;
    }

    private function humanize(string $value): string
    {
        $value = str_replace(['-', '_'], ' ', trim($value));
        $value = preg_replace('/\s+/', ' ', $value) ?? $value;

        return ucfirst(strtolower($value));
    }

    private function normalizeSlug(string $slug): string
    {
        $slug = strtolower(trim($slug));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';

        return trim($slug, '-');
    }

    private function createId(string $prefix): string
    {
        try {
            return sprintf('%s-%s', $prefix, bin2hex(random_bytes(6)));
        } catch (\Throwable) {
            return sprintf('%s-%s', $prefix, uniqid('', true));
        }
    }
}
