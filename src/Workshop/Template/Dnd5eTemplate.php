<?php

namespace App\Workshop\Template;

/**
 * Шаблон пресета системы DnD 5e.
 *
 * Этот класс не содержит бизнес-логику установки сам по себе:
 * он описывает "сырой" набор данных, который затем нормализуется
 * в `SystemInstaller::install()`.
 *
 * Что важно учитывать:
 * - часть значений в массивах имеет строго ограниченный набор допустимых вариантов;
 * - некорректные значения могут быть автоматически заменены на дефолтные;
 * - ссылки на ресурсы/формулы в `getSheetTemplates()` должны совпадать по ключам
 *   с данными из `getResources()` / `getFormulas()`, иначе такие поля могут быть отброшены.
 */
class Dnd5eTemplate extends AbstractSystemTemplate
{
    /**
     * Короткий технический идентификатор системы.
     *
     * Используется как база для slug при установке системы.
     * Должен быть стабильным и предсказуемым: на него могут опираться сидеры, миграции,
     * интеграции и ручные скрипты установки.
     */
    public function getSlug(): string
    {
        return 'dnd5e';
    }

    /**
     * Человекочитаемое название системы для UI.
     *
     * Используется как имя по умолчанию, если в установщике не передан кастомный `$name`.
     */
    public function getName(): string
    {
        return 'Dungeons & Dragons 5e';
    }

    /**
     * Возвращает список базовых ресурсов персонажа.
     *
     * Возможные форматы элемента массива:
     * 1) Строка (как в этом шаблоне), например: `strength`
     *    - будет "очеловечена" в имя (`Strength`) и получит тип `number`.
     * 2) Массив расширенного формата (поддерживается установщиком), например:
     *    ['key' => 'speed', 'name' => 'Speed', 'type' => 'number']
     *
     * Для строкового формата фактически допустимы любые ключи, но безопаснее использовать
     * lower_snake_case, чтобы ключи корректно нормализовались и совпадали в формулах/полях.
     */
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

    /**
     * Возвращает вычисляемые формулы системы.
     *
     * Ожидаемый формат элемента:
     * - `key`/`name` (string): идентификатор/название формулы (если `name` нет, берется `key`);
     * - `expression` (string): выражение, которое будет интерпретироваться движком формул.
     *
     * В этом шаблоне `key` задан в snake_case, чтобы:
     * - удобно ссылаться на него из `getSheetTemplates()` как `sourceKey`;
     * - избежать расхождений после normalizeKey().
     */
    public function getFormulas(): array
    {
        return [
            ['key' => 'strength_mod', 'expression' => 'floor((strength - 10) / 2)'],
            ['key' => 'dexterity_mod', 'expression' => 'floor((dexterity - 10) / 2)'],
            ['key' => 'initiative', 'expression' => 'dexterity_mod'],
            ['key' => 'strength_save', 'expression' => '1d20 + strength_mod + proficiency'],
        ];
    }

    /**
     * Возвращает стартовые шаблоны листов (sheet templates) для токенов.
     *
     * ВАЖНО: ниже перечислены фактические допустимые значения,
     * которые поддерживает `SystemInstaller::buildSheetTemplates()`.
     *
     * Формат верхнего уровня:
     * - `name` (string): отображаемое имя шаблона в UI.
     * - `fields` (array): список полей шаблона.
     *
     * Формат элемента `fields`:
     * - `label` (string): подпись поля в форме.
     * - `kind` (string): источник значения поля.
     *   Допустимые значения:
     *   - `resource` -> поле ссылается на один из ресурсов системы;
     *   - `formula`  -> поле ссылается на формулу системы, обычно read-only;
     *   - `local`    -> локальное поле листа (не ресурс и не формула).
     *   Некорректное значение будет заменено на `local`.
     * - `sourceKey` (string): ключ источника.
     *   Для `resource` должен совпадать с нормализованным ключом ресурса;
     *   для `formula` — с нормализованным ключом формулы;
     *   для `local` — произвольный ключ локального поля.
     * - `inputType` (string): тип ввода в UI.
     *   Допустимые значения:
     *   - `text`,
     *   - `number`,
     *   - `boolean`.
     *   Некорректное значение будет заменено на `text`.
     */
    public function getSheetTemplates(): array
    {
        return [
            [
                'name' => 'Player Character',
                'fields' => [
                    // resource: sourceKey обязан указывать на getResources()
                    ['label' => 'Strength', 'kind' => 'resource', 'sourceKey' => 'strength', 'inputType' => 'number'],
                    ['label' => 'Dexterity', 'kind' => 'resource', 'sourceKey' => 'dexterity', 'inputType' => 'number'],
                    ['label' => 'Constitution', 'kind' => 'resource', 'sourceKey' => 'constitution', 'inputType' => 'number'],
                    // local: полностью локальное поле листа, хранится в данных шаблона
                    ['label' => 'Hit Points', 'kind' => 'local', 'sourceKey' => 'hit_points', 'inputType' => 'number'],
                    // formula: sourceKey обязан указывать на getFormulas()
                    ['label' => 'Initiative', 'kind' => 'formula', 'sourceKey' => 'initiative', 'inputType' => 'number'],
                ],
            ],
            [
                'name' => 'Monster',
                'fields' => [
                    ['label' => 'Strength', 'kind' => 'resource', 'sourceKey' => 'strength', 'inputType' => 'number'],
                    ['label' => 'Dexterity', 'kind' => 'resource', 'sourceKey' => 'dexterity', 'inputType' => 'number'],
                    ['label' => 'Armor Class', 'kind' => 'local', 'sourceKey' => 'armor_class', 'inputType' => 'number'],
                    ['label' => 'Hit Points', 'kind' => 'local', 'sourceKey' => 'hit_points', 'inputType' => 'number'],
                ],
            ],
        ];
    }
}
