<?php

namespace App\Command;

use App\Document\WorkshopSystem;
use App\Workshop\Installer\SystemInstaller;
use App\Workshop\Template\SystemTemplateInterface;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:workshop-system:install',
    description: 'Creates a workshop system from a predefined template.',
)]
/**
 * Комманда для создания базовых систем.
 * Примеры комманд с параметрами (можно использовать несколько одновременно):
 * `php bin/console app:workshop-system:install --list` - лист со всеми доступными системами для установки
 * `php bin/console app:workshop-system:install dnd5e` - установка системы dnd5e
 * `php bin/console app:workshop-system:install dnd5e --slug=my-dnd-system` - установка системы dnd5e с кастомным slug-ом
 * `php bin/console app:workshop-system:install dnd5e --name="D&D 5e Custom Edition"` - установка системы dnd5e с кастомным именем
 * `php bin/console app:workshop-system:install dnd5e --replace` - если система существует, то заменить её
 * `php bin/console app:workshop-system:install dnd5e --slug=my-dnd --replace` - Заменить но с другим именем
 * В основном порядок такой:
 * # 1. Посмотреть шаблоны
 * php bin/console app:workshop-system:install --list
 * # 2. Установить систему
 * php bin/console app:workshop-system:install dnd5e
 * # 3. Если поменял шаблон — переустановить
 * php bin/console app:workshop-system:install dnd5e --replace
 */
class InstallWorkshopSystemCommand extends Command
{
    /**
     * Map доступных шаблонов.
     * Ключ — slug шаблона (например "dnd5e")
     * Значение — реализация SystemTemplateInterface
     * 
     * @var array<string, SystemTemplateInterface>
     */
    private array $templateMap = [];

    public function __construct(
        private readonly SystemInstaller $installer,
        private readonly DocumentManager $dm,
        iterable $templates
    ) {
        /**
         * Symfony через services.yaml передаёт сюда ВСЕ сервисы,
         * помеченные тегом app.workshop_template.
         *
         * Мы превращаем их в карту:
         *     slug => template
         */
        foreach ($templates as $template) {
            if (!$template instanceof SystemTemplateInterface) {
                continue;
            }
            $this->templateMap[$template->getSlug()] = $template;
        }

        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            // Аргумент — slug шаблона (например dnd5e)
            ->addArgument('template', InputArgument::OPTIONAL, 'Template slug to install, e.g. dnd5e.')
            // Можно переопределить slug создаваемой системы. Например вместо dnd5e сделать dnd5e+
            ->addOption('slug', null, InputOption::VALUE_REQUIRED, 'Override workshop system slug.')
            // Можно переопределить отображаемое имя системы. Например вместо Dungeons & Dragons 5e сделать DND5E
            ->addOption('name', null, InputOption::VALUE_REQUIRED, 'Override workshop system name.')
            // Если система с таким slug-ом существует — заменить её
            ->addOption('replace', null, InputOption::VALUE_NONE, 'Replace existing workshop system with the same slug.')
             // Показать список доступных шаблонов
            ->addOption('list', null, InputOption::VALUE_NONE, 'List available templates.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        if ($this->templateMap === []) {
            $io->error('No workshop system templates are registered.');

            return Command::FAILURE;
        }

        if ((bool) $input->getOption('list')) {
            $io->title('Available templates');
            $io->listing(array_keys($this->templateMap));

            return Command::SUCCESS;
        }

        // Если аргумент не передан, используем первый зарегистрированный шаблон.
        $requestedSlug = $input->getArgument('template');
        if (!is_string($requestedSlug) || $requestedSlug === '') {
            $requestedSlug = array_key_first($this->templateMap);
        }

        $template = $this->templateMap[$requestedSlug] ?? null;
        if (!$template instanceof SystemTemplateInterface) {
            $io->error(sprintf(
                'Unknown template "%s". Available templates: %s',
                (string) $requestedSlug,
                implode(', ', array_keys($this->templateMap))
            ));

            return Command::INVALID;
        }

        // Нормализуем slug заранее, чтобы проверка дубликатов была консистентной.
        $systemSlug = $this->normalizeSlug((string) ($input->getOption('slug') ?? $template->getSlug()));
        $existing = $this->dm->getRepository(WorkshopSystem::class)->findOneBy(['slug' => $systemSlug]);
        if ($existing instanceof WorkshopSystem && !$input->getOption('replace')) {
            $io->error(sprintf(
                'Workshop system with slug "%s" already exists. Use --replace to overwrite it.',
                $systemSlug
            ));

            return Command::FAILURE;
        }

        $installed = $this->installer->install(
            $template,
            $existing instanceof WorkshopSystem ? $existing : null,
            is_string($input->getOption('name')) ? $input->getOption('name') : null,
            is_string($input->getOption('slug')) ? $input->getOption('slug') : null,
        );

        $io->success(sprintf(
            'Workshop system "%s" (%s) is ready. ID: %s',
            $installed->getName(),
            (string) $installed->getSlug(),
            (string) $installed->getId()
        ));

        return Command::SUCCESS;
    }

    private function normalizeSlug(string $slug): string
    {
        $slug = strtolower(trim($slug));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';

        return trim($slug, '-');
    }
}
