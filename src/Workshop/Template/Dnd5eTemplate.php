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
            'proficiency',          // Proficiency Bonus
            'level',
            'speed',
            'spellcasting_mod',     // Модификатор способности кастования (Cha/Int/Wis и т.д.)
            // Saving throw proficiency flags
            'strength_save_prof',
            'dexterity_save_prof',
            'constitution_save_prof',
            'intelligence_save_prof',
            'wisdom_save_prof',
            'charisma_save_prof',
            // Skill proficiency flags (0/1/2)
            'acrobatics_prof',
            'animal_handling_prof',
            'arcana_prof',
            'athletics_prof',
            'deception_prof',
            'history_prof',
            'insight_prof',
            'intimidation_prof',
            'investigation_prof',
            'medicine_prof',
            'nature_prof',
            'perception_prof',
            'performance_prof',
            'persuasion_prof',
            'religion_prof',
            'sleight_of_hand_prof',
            'stealth_prof',
            'survival_prof',
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
            // Ability modifiers
            ['key' => 'strength_mod',     'expression' => 'floor((strength - 10) / 2)'],
            ['key' => 'dexterity_mod',    'expression' => 'floor((dexterity - 10) / 2)'],
            ['key' => 'constitution_mod', 'expression' => 'floor((constitution - 10) / 2)'],
            ['key' => 'intelligence_mod', 'expression' => 'floor((intelligence - 10) / 2)'],
            ['key' => 'wisdom_mod',       'expression' => 'floor((wisdom - 10) / 2)'],
            ['key' => 'charisma_mod',     'expression' => 'floor((charisma - 10) / 2)'],

            // Initiative
            ['key' => 'initiative', 'expression' => 'dexterity_mod'],

            // Saving throws (rollable)
            ['key' => 'strength_save',     'expression' => '1d20 + strength_mod + (strength_save_prof * proficiency)'],
            ['key' => 'dexterity_save',    'expression' => '1d20 + dexterity_mod + (dexterity_save_prof * proficiency)'],
            ['key' => 'constitution_save', 'expression' => '1d20 + constitution_mod + (constitution_save_prof * proficiency)'],
            ['key' => 'intelligence_save', 'expression' => '1d20 + intelligence_mod + (intelligence_save_prof * proficiency)'],
            ['key' => 'wisdom_save',       'expression' => '1d20 + wisdom_mod + (wisdom_save_prof * proficiency)'],
            ['key' => 'charisma_save',     'expression' => '1d20 + charisma_mod + (charisma_save_prof * proficiency)'],

            // Skill bonuses
            ['key' => 'acrobatics',       'expression' => 'dexterity_mod + (acrobatics_prof * proficiency)'],
            ['key' => 'animal_handling',  'expression' => 'wisdom_mod + (animal_handling_prof * proficiency)'],
            ['key' => 'arcana',           'expression' => 'intelligence_mod + (arcana_prof * proficiency)'],
            ['key' => 'athletics',        'expression' => 'strength_mod + (athletics_prof * proficiency)'],
            ['key' => 'deception',        'expression' => 'charisma_mod + (deception_prof * proficiency)'],
            ['key' => 'history',          'expression' => 'intelligence_mod + (history_prof * proficiency)'],
            ['key' => 'insight',          'expression' => 'wisdom_mod + (insight_prof * proficiency)'],
            ['key' => 'intimidation',     'expression' => 'charisma_mod + (intimidation_prof * proficiency)'],
            ['key' => 'investigation',    'expression' => 'intelligence_mod + (investigation_prof * proficiency)'],
            ['key' => 'medicine',         'expression' => 'wisdom_mod + (medicine_prof * proficiency)'],
            ['key' => 'nature',           'expression' => 'intelligence_mod + (nature_prof * proficiency)'],
            ['key' => 'perception',       'expression' => 'wisdom_mod + (perception_prof * proficiency)'],
            ['key' => 'performance',      'expression' => 'charisma_mod + (performance_prof * proficiency)'],
            ['key' => 'persuasion',       'expression' => 'charisma_mod + (persuasion_prof * proficiency)'],
            ['key' => 'religion',         'expression' => 'intelligence_mod + (religion_prof * proficiency)'],
            ['key' => 'sleight_of_hand',  'expression' => 'dexterity_mod + (sleight_of_hand_prof * proficiency)'],
            ['key' => 'stealth',          'expression' => 'dexterity_mod + (stealth_prof * proficiency)'],
            ['key' => 'survival',         'expression' => 'wisdom_mod + (survival_prof * proficiency)'],

            // Passives
            ['key' => 'passive_perception',    'expression' => '10 + perception'],
            ['key' => 'passive_investigation', 'expression' => '10 + investigation'],
            ['key' => 'passive_insight',       'expression' => '10 + insight'],

            // Spellcasting (самый частый вариант)
            ['key' => 'spell_attack_bonus', 'expression' => 'proficiency + spellcasting_mod'],
            ['key' => 'spell_save_dc',      'expression' => '8 + proficiency + spellcasting_mod'],
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
                    // === Характеристики ===
                    ['label' => 'Strength',      'kind' => 'resource', 'sourceKey' => 'strength',      'inputType' => 'number'],
                    ['label' => 'Dexterity',     'kind' => 'resource', 'sourceKey' => 'dexterity',     'inputType' => 'number'],
                    ['label' => 'Constitution',  'kind' => 'resource', 'sourceKey' => 'constitution',  'inputType' => 'number'],
                    ['label' => 'Intelligence',  'kind' => 'resource', 'sourceKey' => 'intelligence',  'inputType' => 'number'],
                    ['label' => 'Wisdom',        'kind' => 'resource', 'sourceKey' => 'wisdom',        'inputType' => 'number'],
                    ['label' => 'Charisma',      'kind' => 'resource', 'sourceKey' => 'charisma',      'inputType' => 'number'],
                    // === Основные ===
                    ['label' => 'Level',                'kind' => 'resource', 'sourceKey' => 'level',                'inputType' => 'number'],
                    ['label' => 'Proficiency Bonus',    'kind' => 'resource', 'sourceKey' => 'proficiency',           'inputType' => 'number'],
                    ['label' => 'Speed',                'kind' => 'resource', 'sourceKey' => 'speed',                'inputType' => 'number'],
                    ['label' => 'Spellcasting Modifier', 'kind' => 'resource', 'sourceKey' => 'spellcasting_mod',     'inputType' => 'number'],
                    // === Saving Throw proficiency (boolean или number 0/1) ===
                    ['label' => 'Str Save Prof', 'kind' => 'resource', 'sourceKey' => 'strength_save_prof',     'inputType' => 'boolean'],
                    ['label' => 'Dex Save Prof', 'kind' => 'resource', 'sourceKey' => 'dexterity_save_prof',    'inputType' => 'boolean'],
                    ['label' => 'Con Save Prof', 'kind' => 'resource', 'sourceKey' => 'constitution_save_prof', 'inputType' => 'boolean'],
                    ['label' => 'Int Save Prof', 'kind' => 'resource', 'sourceKey' => 'intelligence_save_prof', 'inputType' => 'boolean'],
                    ['label' => 'Wis Save Prof', 'kind' => 'resource', 'sourceKey' => 'wisdom_save_prof',       'inputType' => 'boolean'],
                    ['label' => 'Cha Save Prof', 'kind' => 'resource', 'sourceKey' => 'charisma_save_prof',     'inputType' => 'boolean'],
                    // === Ability Modifiers (формулы) ===
                    ['label' => 'Strength Mod',     'kind' => 'formula', 'sourceKey' => 'strength_mod',     'inputType' => 'number'],
                    ['label' => 'Dexterity Mod',    'kind' => 'formula', 'sourceKey' => 'dexterity_mod',    'inputType' => 'number'],
                    ['label' => 'Constitution Mod', 'kind' => 'formula', 'sourceKey' => 'constitution_mod', 'inputType' => 'number'],
                    ['label' => 'Intelligence Mod', 'kind' => 'formula', 'sourceKey' => 'intelligence_mod', 'inputType' => 'number'],
                    ['label' => 'Wisdom Mod',       'kind' => 'formula', 'sourceKey' => 'wisdom_mod',       'inputType' => 'number'],
                    ['label' => 'Charisma Mod',     'kind' => 'formula', 'sourceKey' => 'charisma_mod',     'inputType' => 'number'],
                    // === Initiative ===
                    ['label' => 'Initiative',       'kind' => 'formula', 'sourceKey' => 'initiative',       'inputType' => 'number'],
                    // === Saving Throws (формулы с 1d20 + mod + prof) ===
                    ['label' => 'Strength Save',     'kind' => 'formula', 'sourceKey' => 'strength_save',     'inputType' => 'number'],
                    ['label' => 'Dexterity Save',    'kind' => 'formula', 'sourceKey' => 'dexterity_save',    'inputType' => 'number'],
                    ['label' => 'Constitution Save', 'kind' => 'formula', 'sourceKey' => 'constitution_save', 'inputType' => 'number'],
                    ['label' => 'Intelligence Save', 'kind' => 'formula', 'sourceKey' => 'intelligence_save', 'inputType' => 'number'],
                    ['label' => 'Wisdom Save',       'kind' => 'formula', 'sourceKey' => 'wisdom_save',       'inputType' => 'number'],
                    ['label' => 'Charisma Save',     'kind' => 'formula', 'sourceKey' => 'charisma_save',     'inputType' => 'number'],
                    // === Skills Proficiency (resources: 0 = none, 1 = proficient, 2 = expertise) ===
                    ['label' => 'Acrobatics Prof (0/1/2)',     'kind' => 'resource', 'sourceKey' => 'acrobatics_prof',      'inputType' => 'number'],
                    ['label' => 'Animal Handling Prof (0/1/2)', 'kind' => 'resource', 'sourceKey' => 'animal_handling_prof', 'inputType' => 'number'],
                    ['label' => 'Arcana Prof (0/1/2)',         'kind' => 'resource', 'sourceKey' => 'arcana_prof',          'inputType' => 'number'],
                    ['label' => 'Athletics Prof (0/1/2)',      'kind' => 'resource', 'sourceKey' => 'athletics_prof',       'inputType' => 'number'],
                    ['label' => 'Deception Prof (0/1/2)',      'kind' => 'resource', 'sourceKey' => 'deception_prof',       'inputType' => 'number'],
                    ['label' => 'History Prof (0/1/2)',        'kind' => 'resource', 'sourceKey' => 'history_prof',         'inputType' => 'number'],
                    ['label' => 'Insight Prof (0/1/2)',        'kind' => 'resource', 'sourceKey' => 'insight_prof',         'inputType' => 'number'],
                    ['label' => 'Intimidation Prof (0/1/2)',   'kind' => 'resource', 'sourceKey' => 'intimidation_prof',    'inputType' => 'number'],
                    ['label' => 'Investigation Prof (0/1/2)',  'kind' => 'resource', 'sourceKey' => 'investigation_prof',   'inputType' => 'number'],
                    ['label' => 'Medicine Prof (0/1/2)',       'kind' => 'resource', 'sourceKey' => 'medicine_prof',        'inputType' => 'number'],
                    ['label' => 'Nature Prof (0/1/2)',         'kind' => 'resource', 'sourceKey' => 'nature_prof',          'inputType' => 'number'],
                    ['label' => 'Perception Prof (0/1/2)',     'kind' => 'resource', 'sourceKey' => 'perception_prof',      'inputType' => 'number'],
                    ['label' => 'Performance Prof (0/1/2)',    'kind' => 'resource', 'sourceKey' => 'performance_prof',     'inputType' => 'number'],
                    ['label' => 'Persuasion Prof (0/1/2)',     'kind' => 'resource', 'sourceKey' => 'persuasion_prof',      'inputType' => 'number'],
                    ['label' => 'Religion Prof (0/1/2)',       'kind' => 'resource', 'sourceKey' => 'religion_prof',        'inputType' => 'number'],
                    ['label' => 'Sleight of Hand Prof (0/1/2)', 'kind' => 'resource', 'sourceKey' => 'sleight_of_hand_prof',  'inputType' => 'number'],
                    ['label' => 'Stealth Prof (0/1/2)',        'kind' => 'resource', 'sourceKey' => 'stealth_prof',         'inputType' => 'number'],
                    ['label' => 'Survival Prof (0/1/2)',       'kind' => 'resource', 'sourceKey' => 'survival_prof',        'inputType' => 'number'],
                    // === Skill Bonuses (формулы) ===
                    ['label' => 'Acrobatics',       'kind' => 'formula', 'sourceKey' => 'acrobatics',       'inputType' => 'number'],
                    ['label' => 'Animal Handling',  'kind' => 'formula', 'sourceKey' => 'animal_handling',  'inputType' => 'number'],
                    ['label' => 'Arcana',           'kind' => 'formula', 'sourceKey' => 'arcana',           'inputType' => 'number'],
                    ['label' => 'Athletics',        'kind' => 'formula', 'sourceKey' => 'athletics',        'inputType' => 'number'],
                    ['label' => 'Deception',        'kind' => 'formula', 'sourceKey' => 'deception',        'inputType' => 'number'],
                    ['label' => 'History',          'kind' => 'formula', 'sourceKey' => 'history',          'inputType' => 'number'],
                    ['label' => 'Insight',          'kind' => 'formula', 'sourceKey' => 'insight',          'inputType' => 'number'],
                    ['label' => 'Intimidation',     'kind' => 'formula', 'sourceKey' => 'intimidation',     'inputType' => 'number'],
                    ['label' => 'Investigation',    'kind' => 'formula', 'sourceKey' => 'investigation',    'inputType' => 'number'],
                    ['label' => 'Medicine',         'kind' => 'formula', 'sourceKey' => 'medicine',         'inputType' => 'number'],
                    ['label' => 'Nature',           'kind' => 'formula', 'sourceKey' => 'nature',           'inputType' => 'number'],
                    ['label' => 'Perception',       'kind' => 'formula', 'sourceKey' => 'perception',       'inputType' => 'number'],
                    ['label' => 'Performance',      'kind' => 'formula', 'sourceKey' => 'performance',      'inputType' => 'number'],
                    ['label' => 'Persuasion',       'kind' => 'formula', 'sourceKey' => 'persuasion',       'inputType' => 'number'],
                    ['label' => 'Religion',         'kind' => 'formula', 'sourceKey' => 'religion',         'inputType' => 'number'],
                    ['label' => 'Sleight of Hand',  'kind' => 'formula', 'sourceKey' => 'sleight_of_hand',  'inputType' => 'number'],
                    ['label' => 'Stealth',          'kind' => 'formula', 'sourceKey' => 'stealth',          'inputType' => 'number'],
                    ['label' => 'Survival',         'kind' => 'formula', 'sourceKey' => 'survival',         'inputType' => 'number'],
                    // Passives
                    ['label' => 'Passive Perception',    'kind' => 'formula', 'sourceKey' => 'passive_perception',    'inputType' => 'number'],
                    ['label' => 'Passive Investigation', 'kind' => 'formula', 'sourceKey' => 'passive_investigation', 'inputType' => 'number'],
                    // Spellcasting
                    ['label' => 'Spell Attack Bonus', 'kind' => 'formula', 'sourceKey' => 'spell_attack_bonus', 'inputType' => 'number'],
                    ['label' => 'Spell Save DC',      'kind' => 'formula', 'sourceKey' => 'spell_save_dc',      'inputType' => 'number'],
                    // Локальные поля (не зависят от ресурсов/формул)
                    ['label' => 'Hit Points',   'kind' => 'local', 'sourceKey' => 'hit_points',   'inputType' => 'number'],
                    ['label' => 'Armor Class',  'kind' => 'local', 'sourceKey' => 'armor_class',  'inputType' => 'number'],
                    ['label' => 'Inspiration',  'kind' => 'local', 'sourceKey' => 'inspiration',  'inputType' => 'boolean'],
                ],
            ],
            // Monster
            [
                'name' => 'Monster',
                'fields' => [
                    ['label' => 'Strength',     'kind' => 'resource', 'sourceKey' => 'strength',     'inputType' => 'number'],
                    ['label' => 'Dexterity',    'kind' => 'resource', 'sourceKey' => 'dexterity',    'inputType' => 'number'],
                    ['label' => 'Armor Class',  'kind' => 'local',    'sourceKey' => 'armor_class',  'inputType' => 'number'],
                    ['label' => 'Hit Points',   'kind' => 'local',    'sourceKey' => 'hit_points',   'inputType' => 'number'],
                    ['label' => 'Initiative',   'kind' => 'formula',  'sourceKey' => 'initiative',   'inputType' => 'number'],
                    ['label' => 'Perception',   'kind' => 'formula',  'sourceKey' => 'perception',   'inputType' => 'number'],
                ],
            ],
        ];
    }
}
