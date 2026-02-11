<?php

namespace App\Service;

use App\Repository\TokenRepository;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Component\ExpressionLanguage\ExpressionFunction;
use Symfony\Component\ExpressionLanguage\ExpressionLanguage;

final class FormulaEngine
{
    private const RESERVED_NAMES = [
        'true',
        'false',
        'null',
        'and',
        'or',
        'not',
    ];

    private const FUNCTION_NAMES = [
        'floor',
        'min',
        'max',
        'dice',
    ];

    private ExpressionLanguage $expressionLanguage;

    public function __construct(
        private readonly DocumentManager $dm,
        private readonly TokenRepository $tokenRepository,
        ?ExpressionLanguage $expressionLanguage = null
    ) {
        $this->expressionLanguage = $expressionLanguage ?? new ExpressionLanguage();
        $this->registerFunctions();
    }

    /**
     * Compute all formulas and return merged values (base token values + formula results).
     */
    public function computeAll(array $tokenValues, array $formulas): array
    {
        $normalized = $this->normalizeFormulas($formulas);
        $graph = $this->buildDependencyGraph($normalized);
        $order = $this->topologicalSort($graph['depsByKey'], $graph['dependentsByKey']);
        $values = $tokenValues;

        $byKey = [];
        foreach ($normalized as $formula) {
            $byKey[$formula['key']] = $formula;
        }

        foreach ($order as $key) {
            if (!isset($byKey[$key])) {
                continue;
            }
            $expression = $this->normalizeExpression($byKey[$key]['expression']);
            $values[$key] = $this->evaluateExpression($expression, $values);
        }

        return $values;
    }

    /**
     * Recompute only formulas affected by changed keys.
     */
    public function recomputeAffected(array $tokenValues, array $formulas, array $changedKeys): array
    {
        $normalized = $this->normalizeFormulas($formulas);
        $graph = $this->buildDependencyGraph($normalized);
        $order = $this->topologicalSort($graph['depsByKey'], $graph['dependentsByKey']);
        $values = $tokenValues;

        $byKey = [];
        foreach ($normalized as $formula) {
            $byKey[$formula['key']] = $formula;
        }

        $changed = array_fill_keys($changedKeys, true);
        $affected = [];
        $queue = [];

        foreach ($graph['depsByKey'] as $key => $deps) {
            $isAffected = isset($changed[$key]);
            if (!$isAffected) {
                foreach ($deps as $dep) {
                    if (isset($changed[$dep])) {
                        $isAffected = true;
                        break;
                    }
                }
            }
            if ($isAffected) {
                $affected[$key] = true;
                $queue[] = $key;
            }
        }

        while (!empty($queue)) {
            $current = array_shift($queue);
            foreach ($graph['dependentsByKey'][$current] ?? [] as $dependent) {
                if (!isset($affected[$dependent])) {
                    $affected[$dependent] = true;
                    $queue[] = $dependent;
                }
            }
        }

        foreach ($order as $key) {
            if (!isset($affected[$key]) || !isset($byKey[$key])) {
                continue;
            }
            $expression = $this->normalizeExpression($byKey[$key]['expression']);
            $values[$key] = $this->evaluateExpression($expression, $values);
        }

        return $values;
    }

    /**
     * Compute and persist values for a token.
     */
    public function computeAndPersistTokenValues(
        string $tokenId,
        array $tokenValues,
        array $formulas,
        ?array $changedKeys = null
    ): array {
        $values = $changedKeys === null
            ? $this->computeAll($tokenValues, $formulas)
            : $this->recomputeAffected($tokenValues, $formulas, $changedKeys);

        $token = $this->tokenRepository->find($tokenId);
        if ($token === null) {
            throw new \RuntimeException('Token not found.');
        }

        if (!method_exists($token, 'setValues')) {
            throw new \RuntimeException('Token does not support values storage.');
        }

        $token->setValues($values);
        $this->dm->persist($token);
        $this->dm->flush();

        return $values;
    }

    /**
     * Normalize formula list: ensure key, name, expression are present.
     */
    private function normalizeFormulas(array $formulas): array
    {
        $normalized = [];
        foreach ($formulas as $index => $formula) {
            $safe = is_array($formula) ? $formula : [];
            $rawKey = $safe['key'] ?? $safe['name'] ?? ('formula_' . ($index + 1));
            $key = $this->normalizeKey((string) $rawKey);
            $normalized[] = [
                'id' => is_string($safe['id'] ?? null) ? $safe['id'] : ('formula-' . ($index + 1)),
                'key' => $key,
                'name' => is_string($safe['name'] ?? null) && trim((string) $safe['name']) !== ''
                    ? $safe['name']
                    : $key,
                'expression' => is_string($safe['expression'] ?? null) ? $safe['expression'] : '',
            ];
        }
        return $normalized;
    }

    private function normalizeKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9_]/', '_', $normalized) ?? '';
        $normalized = preg_replace('/_+/', '_', $normalized) ?? '';
        $normalized = trim($normalized, '_');
        return $normalized !== '' ? $normalized : 'formula';
    }

    // Replace dice notation like "1d8" or "d6" with "dice(1,8)" / "dice(1,6)".
    private function normalizeExpression(string $expression): string
    {
        return preg_replace_callback('/\b(\d+)?\s*d\s*(\d+)\b/i', function ($matches) {
            $count = $matches[1] !== '' ? (int) $matches[1] : 1;
            $sides = (int) $matches[2];
            return sprintf('dice(%d,%d)', $count, $sides);
        }, $expression) ?? $expression;
    }

    // Extract variable names from expression to build dependencies.
    private function extractVariables(string $expression): array
    {
        $normalized = $this->normalizeExpression($expression);
        preg_match_all('/\b[a-zA-Z_][a-zA-Z0-9_]*\b/', $normalized, $matches);
        $names = array_unique($matches[0] ?? []);

        $filtered = [];
        foreach ($names as $name) {
            $lower = strtolower($name);
            if (in_array($lower, self::RESERVED_NAMES, true)) {
                continue;
            }
            if (in_array($lower, self::FUNCTION_NAMES, true)) {
                continue;
            }
            $filtered[] = $name;
        }

        return $filtered;
    }

    /**
     * Build dependency graph between formulas:
     * - depsByKey: formula key => dependencies
     * - dependentsByKey: formula key => list of formulas that depend on it
     */
    private function buildDependencyGraph(array $formulas): array
    {
        $keys = array_map(static fn (array $formula) => $formula['key'], $formulas);
        $keySet = array_fill_keys($keys, true);

        $depsByKey = [];
        $dependentsByKey = [];

        foreach ($formulas as $formula) {
            $vars = $this->extractVariables($formula['expression']);
            $deps = [];
            foreach ($vars as $var) {
                if (isset($keySet[$var])) {
                    $deps[] = $var;
                    $dependentsByKey[$var] ??= [];
                    $dependentsByKey[$var][] = $formula['key'];
                }
            }
            $depsByKey[$formula['key']] = $deps;
        }

        return [
            'depsByKey' => $depsByKey,
            'dependentsByKey' => $dependentsByKey,
        ];
    }

    /**
     * Topological sort with cycle detection (Kahn's algorithm).
     */
    private function topologicalSort(array $depsByKey, array $dependentsByKey): array
    {
        $inDegree = [];
        foreach ($depsByKey as $key => $deps) {
            $inDegree[$key] = count($deps);
        }

        $queue = [];
        foreach ($inDegree as $key => $count) {
            if ($count === 0) {
                $queue[] = $key;
            }
        }

        $order = [];
        while (!empty($queue)) {
            $key = array_shift($queue);
            $order[] = $key;

            foreach ($dependentsByKey[$key] ?? [] as $dependent) {
                $inDegree[$dependent] -= 1;
                if ($inDegree[$dependent] === 0) {
                    $queue[] = $dependent;
                }
            }
        }

        if (count($order) !== count($inDegree)) {
            throw new \RuntimeException('Cycle detected in formulas dependency graph.');
        }

        return $order;
    }

    private function evaluateExpression(string $expression, array $values): float|int
    {
        try {
            $result = $this->expressionLanguage->evaluate($expression, $values);
        } catch (\Throwable $exception) {
            throw new \RuntimeException('Failed to evaluate expression: ' . $exception->getMessage(), 0, $exception);
        }

        if (!is_int($result) && !is_float($result)) {
            throw new \RuntimeException('Expression result must be numeric.');
        }

        return $result;
    }

    private function registerFunctions(): void
    {
        $this->expressionLanguage->addFunction(new ExpressionFunction(
            'floor',
            static fn ($value) => sprintf('floor(%s)', $value),
            static fn (array $values, $value) => floor($value)
        ));

        $this->expressionLanguage->addFunction(new ExpressionFunction(
            'min',
            static fn (...$args) => sprintf('min(%s)', implode(', ', $args)),
            static fn (array $values, ...$args) => min(...$args)
        ));

        $this->expressionLanguage->addFunction(new ExpressionFunction(
            'max',
            static fn (...$args) => sprintf('max(%s)', implode(', ', $args)),
            static fn (array $values, ...$args) => max(...$args)
        ));

        $this->expressionLanguage->addFunction(new ExpressionFunction(
            'dice',
            static fn ($count, $sides) => sprintf('dice(%s, %s)', $count, $sides),
            fn (array $values, $count, $sides) => $this->rollDice($count, $sides)
        ));
    }

    private function rollDice(int|float $count, int|float $sides): int
    {
        $safeCount = max(0, (int) floor($count));
        $safeSides = max(1, (int) floor($sides));
        $total = 0;

        for ($i = 0; $i < $safeCount; $i += 1) {
            $total += random_int(1, $safeSides);
        }

        return $total;
    }
}
