<?php

namespace App\Controller;

use App\Document\RollHistory;
use App\Document\Session;
use App\Document\Token;
use App\Document\TokenType;
use App\Document\WorkshopSystem;
use App\Form\TokenFormType;
use App\Service\FormulaEngine;
use App\Service\SheetTemplateCatalogBuilder;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Form\FormError;
use Symfony\Component\Form\FormInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class TokenController extends AbstractController
{
    public function __construct(
        private readonly SheetTemplateCatalogBuilder $sheetTemplateCatalogBuilder,
        private readonly FormulaEngine $formulaEngine,
    ) {
    }

    #[Route('/token/create', name: 'token_create')]
    public function index(Request $request, DocumentManager $dm): Response
    {
        $this->ensureDefaultTokenTypes($dm);

        $token = new Token();
        $sessionId = $request->query->get('session');
        if (is_string($sessionId) && $sessionId !== '') {
            $token->setSessionId($sessionId);
        }
        $session = $this->resolveSession($dm, $sessionId);
        if ($session !== null) {
            $token->setWorkshopSystemId($session->getWorkshopSystemId());
        }
        $sessionWorkshopSystemId = $token->getWorkshopSystemId();

        $catalog = $this->buildSystemCatalog($dm);
        $this->sanitizeTokenSheetTemplateBySessionSystem($token, $catalog);
        $form = $this->createForm(
            TokenFormType::class,
            $token,
            $this->buildTokenFormOptions($catalog, $sessionWorkshopSystemId)
        );
        $form->handleRequest($request);

        if ($form->isSubmitted()) {
            // Система токена берётся из сессии, не из payload формы.
            $token->setWorkshopSystemId($sessionWorkshopSystemId);
            $this->applyTemplateValuesFromForm($form, $token, $catalog);
        }

        if ($form->isSubmitted() && $form->isValid()) {
            $this->handleTokenImageUpload($form, $token);

            $dm->persist($token);
            $dm->flush();

            if ($request->isXmlHttpRequest()) {
                $redirect = is_string($sessionId) && $sessionId !== ''
                    ? $this->generateUrl('session_open', ['id' => $sessionId])
                    : $this->generateUrl('session_index');

                return $this->json([
                    'success' => true,
                    'redirect' => $redirect,
                ]);
            }

            return $this->redirectToRoute('session_index');
        }

        return $this->render('token/create.html.twig', [
            'form' => $form->createView(),
            'sessionId' => $sessionId,
            'tokenTemplateCatalog' => $catalog,
            'tokenValues' => $token->getValues(),
            'sessionWorkshopSystemId' => $sessionWorkshopSystemId,
        ]);
    }

    #[Route('/token/{id}/move', name: 'token_move', methods: ['POST'])]
    public function move(string $id, Request $request, DocumentManager $dm): JsonResponse
    {
        $repo = $dm->getRepository(Token::class);

        $token = $repo->find($id);
        if (!$token) {
            return $this->json(['error' => 'Token not found'], 404);
        }

        $data = json_decode($request->getContent(), true);

        $token->setX((int) $data['x']);
        $token->setY((int) $data['y']);
        if (array_key_exists('mapId', $data)) {
            $token->setMapId(is_string($data['mapId']) ? $data['mapId'] : null);
        }

        $dm->persist($token);
        $dm->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/token/{id}/run-function', name: 'token_run_function', methods: ['POST'])]
    public function runFunction(string $id, Request $request, DocumentManager $dm): JsonResponse
    {
        $token = $dm->getRepository(Token::class)->find($id);
        if (!$token instanceof Token) {
            return $this->json(['error' => 'Token not found'], Response::HTTP_NOT_FOUND);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['error' => 'Invalid payload'], Response::HTTP_BAD_REQUEST);
        }

        $payloadSessionId = $payload['sessionId'] ?? null;
        if (is_string($payloadSessionId) && $payloadSessionId !== '' && $token->getSessionId() !== $payloadSessionId) {
            return $this->json(['error' => 'Token does not belong to current session'], Response::HTTP_BAD_REQUEST);
        }

        $tokenSessionId = $token->getSessionId();
        if (!is_string($tokenSessionId) || $tokenSessionId === '') {
            return $this->json(['error' => 'Token does not belong to current session'], Response::HTTP_BAD_REQUEST);
        }

        $session = $this->resolveSession($dm, $tokenSessionId);
        if ($session !== null) {
            $token->setWorkshopSystemId($session->getWorkshopSystemId());
        }

        $systemId = $token->getWorkshopSystemId();
        if (!is_string($systemId) || $systemId === '') {
            return $this->json(['error' => 'Session workshop system is not set.'], Response::HTTP_BAD_REQUEST);
        }

        $catalog = $this->buildSystemCatalog($dm);
        $system = $catalog[$systemId] ?? null;
        if (!is_array($system)) {
            return $this->json(['error' => 'Selected workshop system was not found.'], Response::HTTP_BAD_REQUEST);
        }

        $systemFormulas = is_array($system['formulas'] ?? null) ? $system['formulas'] : [];
        $baseValues = $token->getValues();
        $resourceDefaults = [];
        $resources = is_array($system['resources'] ?? null) ? $system['resources'] : [];
        foreach ($resources as $resource) {
            if (!is_array($resource)) {
                continue;
            }

            $resourceKey = is_string($resource['key'] ?? null) ? $resource['key'] : null;
            if ($resourceKey === null || $resourceKey === '') {
                continue;
            }

            $resourceType = is_string($resource['type'] ?? null) ? $resource['type'] : 'text';
            $resourceDefaults[$resourceKey] = match ($resourceType) {
                'number' => 0,
                'boolean' => false,
                default => '',
            };
        }
        $baseValues = array_merge($resourceDefaults, $baseValues);

        $formulaKey = is_string($payload['formulaKey'] ?? null) ? trim((string) $payload['formulaKey']) : '';
        $customName = is_string($payload['name'] ?? null) ? trim((string) $payload['name']) : '';
        $customExpression = is_string($payload['expression'] ?? null) ? trim((string) $payload['expression']) : '';
        $rollMode = $this->normalizeRollMode($payload['rollMode'] ?? null);
        $attemptCount = $rollMode === 'normal' ? 1 : 2;

        if ($formulaKey !== '') {
            $formula = $this->findSystemFormulaByKey($systemFormulas, $formulaKey);
            if (!is_array($formula)) {
                return $this->json(
                    ['error' => 'Selected formula does not exist in current workshop system.'],
                    Response::HTTP_BAD_REQUEST
                );
            }

            $results = [];
            for ($attempt = 0; $attempt < $attemptCount; $attempt++) {
                try {
                    $computedValues = !empty($systemFormulas)
                        ? $this->formulaEngine->computeAll($baseValues, $systemFormulas)
                        : $baseValues;
                } catch (\Throwable $exception) {
                    return $this->json(
                        ['error' => 'Cannot compute workshop system formulas for this token.'],
                        Response::HTTP_BAD_REQUEST
                    );
                }

                $result = $computedValues[$formulaKey] ?? null;
                if (!is_int($result) && !is_float($result)) {
                    return $this->json(
                        ['error' => 'Selected formula could not be evaluated.'],
                        Response::HTTP_BAD_REQUEST
                    );
                }

                $results[] = $result;
            }

            $name = is_string($formula['name'] ?? null) && $formula['name'] !== '' ? $formula['name'] : $formulaKey;
            $expression = is_string($formula['expression'] ?? null) ? $formula['expression'] : '';
            $selectedIndex = $this->resolveSelectedResultIndex($rollMode, $results);
            $selectedResult = $results[$selectedIndex ?? 0] ?? null;
            if (!is_int($selectedResult) && !is_float($selectedResult)) {
                return $this->json(
                    ['error' => 'Selected formula could not be evaluated.'],
                    Response::HTTP_BAD_REQUEST
                );
            }

            $this->persistRollHistory($dm, $tokenSessionId, [
                'tokenId' => $token->getId(),
                'tokenName' => $token->getName(),
                'formulaKey' => $formulaKey,
                'name' => $name,
                'expression' => $expression,
                'rollMode' => $rollMode,
                'results' => $results,
                'selectedIndex' => $selectedIndex,
                'result' => $selectedResult,
            ]);

            return $this->json([
                'ok' => true,
                'tokenId' => $token->getId(),
                'tokenName' => $token->getName(),
                'name' => $name,
                'expression' => $expression,
                'rollMode' => $rollMode,
                'results' => $results,
                'selectedIndex' => $selectedIndex,
                'result' => $selectedResult,
            ]);
        }

        if ($customExpression === '') {
            return $this->json(
                ['error' => 'Provide formula key or custom expression.'],
                Response::HTTP_BAD_REQUEST
            );
        }

        $results = [];
        $manualFormulaKey = 'manual_result';
        for ($attempt = 0; $attempt < $attemptCount; $attempt++) {
            try {
                $computedValues = !empty($systemFormulas)
                    ? $this->formulaEngine->computeAll($baseValues, $systemFormulas)
                    : $baseValues;
            } catch (\Throwable $exception) {
                return $this->json(
                    ['error' => 'Cannot compute workshop system formulas for this token.'],
                    Response::HTTP_BAD_REQUEST
                );
            }

            try {
                $manualValues = $this->formulaEngine->computeAll($computedValues, [[
                    'key' => $manualFormulaKey,
                    'name' => $manualFormulaKey,
                    'expression' => $customExpression,
                ]]);
            } catch (\Throwable $exception) {
                return $this->json(
                    ['error' => 'Cannot evaluate custom expression.'],
                    Response::HTTP_BAD_REQUEST
                );
            }

            $manualResult = $manualValues[$manualFormulaKey] ?? null;

            if (!is_int($manualResult) && !is_float($manualResult)) {
                return $this->json(
                    ['error' => 'Custom expression result must be numeric.'],
                    Response::HTTP_BAD_REQUEST
                );
            }

            $results[] = $manualResult;
        }

        $manualName = $customName !== '' ? $customName : 'Custom function';
        $selectedIndex = $this->resolveSelectedResultIndex($rollMode, $results);
        $selectedResult = $results[$selectedIndex ?? 0] ?? null;
        if (!is_int($selectedResult) && !is_float($selectedResult)) {
            return $this->json(
                ['error' => 'Custom expression result must be numeric.'],
                Response::HTTP_BAD_REQUEST
            );
        }

        $this->persistRollHistory($dm, $tokenSessionId, [
            'tokenId' => $token->getId(),
            'tokenName' => $token->getName(),
            'formulaKey' => null,
            'name' => $manualName,
            'expression' => $customExpression,
            'rollMode' => $rollMode,
            'results' => $results,
            'selectedIndex' => $selectedIndex,
            'result' => $selectedResult,
        ]);

        return $this->json([
            'ok' => true,
            'tokenId' => $token->getId(),
            'tokenName' => $token->getName(),
            'name' => $manualName,
            'expression' => $customExpression,
            'rollMode' => $rollMode,
            'results' => $results,
            'selectedIndex' => $selectedIndex,
            'result' => $selectedResult,
        ]);
    }

    #[Route('/token/{id}/spawn', name: 'token_spawn', methods: ['POST'])]
    public function spawn(string $id, Request $request, DocumentManager $dm): JsonResponse
    {
        $repo = $dm->getRepository(Token::class);
        $template = $repo->find($id);
        if (!$template) {
            return $this->json(['error' => 'Token not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        $mapId = isset($data['mapId']) && is_string($data['mapId']) ? $data['mapId'] : null;

        $token = new Token();
        $token->setName($template->getName());
        $token->setSessionId($template->getSessionId());
        $token->setTemplateId($template->getId());
        $token->setMapId($mapId);
        $token->setX((int) ($data['x'] ?? 0));
        $token->setY((int) ($data['y'] ?? 0));
        $token->setSizeX($template->getSizeX());
        $token->setSizeY($template->getSizeY());
        $token->setRotation($template->getRotation());
        $token->setImagePath($template->getImagePath());
        $token->setTokenType($template->getTokenType());
        $token->setWorkshopSystemId($template->getWorkshopSystemId());
        $token->setSheetTemplateId($template->getSheetTemplateId());
        $token->setValues($template->getValues());

        $dm->persist($token);
        $dm->flush();

        return $this->json([
            'id' => $token->getId(),
            'name' => $token->getName(),
            'x' => $token->getX(),
            'y' => $token->getY(),
            'mapId' => $token->getMapId(),
            'templateId' => $token->getTemplateId(),
            'sizeX' => $token->getSizeX(),
            'sizeY' => $token->getSizeY(),
            'rotation' => $token->getRotation(),
            'imagePath' => $token->getImagePath(),
            'workshopSystemId' => $token->getWorkshopSystemId(),
            'sheetTemplateId' => $token->getSheetTemplateId(),
            'values' => $token->getValues(),
        ]);
    }

    #[Route('/token/{id}/remove', name: 'token_remove', methods: ['POST'])]
    public function remove(string $id, DocumentManager $dm): JsonResponse
    {
        $repo = $dm->getRepository(Token::class);
        $token = $repo->find($id);
        if (!$token) {
            return $this->json(['error' => 'Token not found'], 404);
        }

        if ($token->getTemplateId() === null && $token->getMapId() === null) {
            $clones = $repo->findBy(['templateId' => $token->getId()]);
            foreach ($clones as $clone) {
                $dm->remove($clone);
            }

            $imagePath = $token->getImagePath();
            if (is_string($imagePath) && $imagePath !== '') {
                $projectDir = $this->getParameter('kernel.project_dir');
                $relativePath = ltrim($imagePath, '/');
                $fullPath = $projectDir . '/public/' . $relativePath;
                if (str_starts_with($relativePath, 'uploads/tokens/') && is_file($fullPath)) {
                    @unlink($fullPath);
                }
            }
        }

        $dm->remove($token);
        $dm->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/token/{id}/edit', name: 'token_edit', methods: ['GET', 'POST'])]
    public function edit(string $id, Request $request, DocumentManager $dm): Response
    {
        $this->ensureDefaultTokenTypes($dm);

        $repo = $dm->getRepository(Token::class);
        $token = $repo->find($id);
        if (!$token) {
            return $this->json(['error' => 'Token not found'], 404);
        }

        $sessionId = $request->query->get('session');
        if (!is_string($sessionId) || $sessionId === '') {
            $sessionId = $token->getSessionId();
        }
        $session = $this->resolveSession($dm, $sessionId);
        if ($session !== null) {
            $token->setWorkshopSystemId($session->getWorkshopSystemId());
        }
        $sessionWorkshopSystemId = $token->getWorkshopSystemId();

        $catalog = $this->buildSystemCatalog($dm);
        $this->sanitizeTokenSheetTemplateBySessionSystem($token, $catalog);
        $form = $this->createForm(
            TokenFormType::class,
            $token,
            $this->buildTokenFormOptions($catalog, $sessionWorkshopSystemId)
        );
        $form->handleRequest($request);

        if ($form->isSubmitted()) {
            // Система токена берётся из сессии, не из payload формы.
            $token->setWorkshopSystemId($sessionWorkshopSystemId);
            $this->applyTemplateValuesFromForm($form, $token, $catalog);
        }

        if ($form->isSubmitted() && $form->isValid()) {
            $this->handleTokenImageUpload($form, $token);
            $dm->persist($token);

            // Если правим базовый шаблон токена, синхронизируем все его клоны на карте.
            if ($token->getTemplateId() === null && $token->getMapId() === null) {
                $clones = $repo->findBy(['templateId' => $token->getId()]);
                foreach ($clones as $clone) {
                    $clone->setName($token->getName());
                    $clone->setSizeX($token->getSizeX());
                    $clone->setSizeY($token->getSizeY());
                    $clone->setRotation($token->getRotation());
                    $clone->setImagePath($token->getImagePath());
                    $clone->setTokenType($token->getTokenType());
                    $clone->setWorkshopSystemId($token->getWorkshopSystemId());
                    $clone->setSheetTemplateId($token->getSheetTemplateId());
                    $clone->setValues($token->getValues());
                    $dm->persist($clone);
                }
            }

            $dm->flush();

            $redirect = is_string($sessionId) && $sessionId !== ''
                ? $this->generateUrl('session_open', ['id' => $sessionId])
                : $this->generateUrl('session_index');

            return $this->json(['success' => true, 'redirect' => $redirect]);
        }

        return $this->render('token/edit.html.twig', [
            'form' => $form->createView(),
            'sessionId' => $sessionId,
            'tokenId' => $token->getId(),
            'tokenTemplateCatalog' => $catalog,
            'tokenValues' => $token->getValues(),
            'sessionWorkshopSystemId' => $sessionWorkshopSystemId,
        ]);
    }

    #[Route('/token/{id}/update', name: 'token_update', methods: ['POST'])]
    public function update(string $id, Request $request, DocumentManager $dm): JsonResponse
    {
        $repo = $dm->getRepository(Token::class);
        $token = $repo->find($id);
        if (!$token) {
            return $this->json(['error' => 'Token not found'], 404);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid payload'], 400);
        }

        if (array_key_exists('name', $data) && is_string($data['name'])) {
            $token->setName($data['name']);
        }
        if (array_key_exists('sizeX', $data)) {
            $token->setSizeX((int) $data['sizeX']);
        }
        if (array_key_exists('sizeY', $data)) {
            $token->setSizeY((int) $data['sizeY']);
        }
        if (array_key_exists('rotation', $data)) {
            $token->setRotation((int) $data['rotation']);
        }
        if (array_key_exists('imagePath', $data)) {
            $token->setImagePath(is_string($data['imagePath']) ? $data['imagePath'] : null);
        }
        $sheetTemplateChanged = false;
        if (array_key_exists('sheetTemplateId', $data)) {
            $token->setSheetTemplateId(is_string($data['sheetTemplateId']) && $data['sheetTemplateId'] !== '' ? $data['sheetTemplateId'] : null);
            $sheetTemplateChanged = true;
        }

        $session = $this->resolveSession($dm, $token->getSessionId());
        if ($session !== null) {
            $token->setWorkshopSystemId($session->getWorkshopSystemId());
        }

        $catalog = $this->buildSystemCatalog($dm);
        $rawValues = null;
        if (array_key_exists('values', $data)) {
            if (!is_array($data['values'])) {
                return $this->json(['error' => 'Invalid values payload.'], 400);
            }

            $rawValues = $data['values'];
        }

        // Валидируем выбранный sheet всегда при его смене, даже если values не переданы.
        if ($sheetTemplateChanged || $rawValues !== null) {
            $templateError = $this->hydrateTokenValuesFromTemplate(
                $token,
                $catalog,
                is_array($rawValues) ? $rawValues : $token->getValues()
            );
            if ($templateError !== null) {
                return $this->json(['error' => $templateError], 400);
            }
        }

        $dm->persist($token);

        if ($token->getTemplateId() === null && $token->getMapId() === null) {
            $clones = $repo->findBy(['templateId' => $token->getId()]);
            foreach ($clones as $clone) {
                $clone->setName($token->getName());
                $clone->setSizeX($token->getSizeX());
                $clone->setSizeY($token->getSizeY());
                $clone->setRotation($token->getRotation());
                $clone->setImagePath($token->getImagePath());
                $clone->setTokenType($token->getTokenType());
                $clone->setWorkshopSystemId($token->getWorkshopSystemId());
                $clone->setSheetTemplateId($token->getSheetTemplateId());
                $clone->setValues($token->getValues());
                $dm->persist($clone);
            }
        }

        $dm->flush();

        return $this->json(['ok' => true]);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function buildSystemCatalog(DocumentManager $dm): array
    {
        $systems = $dm->getRepository(WorkshopSystem::class)->findAll();

        return $this->sheetTemplateCatalogBuilder->buildCatalog($systems);
    }

    /**
     * @param array<string, array<string, mixed>> $catalog
     */
    private function buildTokenFormOptions(array $catalog, ?string $systemId): array
    {
        if (!is_string($systemId) || $systemId === '') {
            return [
                'sheet_template_choices' => [],
                'sheet_template_choice_attr' => [],
            ];
        }

        $system = $catalog[$systemId] ?? null;
        if (!is_array($system)) {
            return [
                'sheet_template_choices' => [],
                'sheet_template_choice_attr' => [],
            ];
        }

        $choices = [];
        $attrs = [];
        $templates = is_array($system['sheetTemplates'] ?? null) ? $system['sheetTemplates'] : [];
        foreach ($templates as $template) {
            if (!is_array($template)) {
                continue;
            }

            $templateId = $template['id'] ?? null;
            if (!is_string($templateId) || $templateId === '') {
                continue;
            }

            $templateName = is_string($template['name'] ?? null) ? $template['name'] : $templateId;
            $choices[$templateName] = $templateId;
            $attrs[$templateId] = [
                'data-template-id' => $templateId,
                'data-system-id' => $systemId,
            ];
        }

        return [
            'sheet_template_choices' => $choices,
            'sheet_template_choice_attr' => $attrs,
        ];
    }

    /**
     * Применяем к токену значения из выбранного шаблона листа.
     */
    private function applyTemplateValuesFromForm(FormInterface $form, Token $token, array $catalog): void
    {
        $valuesPayload = $form->get('valuesJson')->getData();
        $values = $this->decodeValuesPayload($valuesPayload);
        if ($values === null) {
            $form->addError(new FormError('Template values payload must be valid JSON object.'));
            return;
        }

        $templateError = $this->hydrateTokenValuesFromTemplate($token, $catalog, $values);
        if ($templateError !== null) {
            $form->addError(new FormError($templateError));
        }
    }

    /**
     * @param array<string, array<string, mixed>> $catalog
     * @param array<string, mixed> $rawValues
     */
    private function hydrateTokenValuesFromTemplate(Token $token, array $catalog, array $rawValues): ?string
    {
        $systemId = $token->getWorkshopSystemId();
        $templateId = $token->getSheetTemplateId();

        if ($templateId === null || $templateId === '') {
            $token->setValues([]);
            return null;
        }

        if ($systemId === null || $systemId === '') {
            return 'Session workshop system is not set. Edit session settings first.';
        }

        $system = $catalog[$systemId] ?? null;
        if (!is_array($system)) {
            return 'Selected workshop system was not found.';
        }

        $template = $this->sheetTemplateCatalogBuilder->findSheetTemplate($catalog, $systemId, $templateId);
        if (!is_array($template)) {
            return 'Selected sheet template does not belong to selected workshop system.';
        }

        $editableValues = $this->sheetTemplateCatalogBuilder->normalizeEditableValues($template, $rawValues);

        $templateFields = is_array($template['fields'] ?? null) ? $template['fields'] : [];
        $hasFormulaFields = false;
        foreach ($templateFields as $templateField) {
            if (is_array($templateField) && (($templateField['kind'] ?? null) === 'formula')) {
                $hasFormulaFields = true;
                break;
            }
        }

        $computedValues = $editableValues;
        $formulas = is_array($system['formulas'] ?? null) ? $system['formulas'] : [];
        if ($hasFormulaFields && !empty($formulas)) {
            $resourceDefaults = [];
            $resources = is_array($system['resources'] ?? null) ? $system['resources'] : [];
            foreach ($resources as $resource) {
                if (!is_array($resource)) {
                    continue;
                }

                $key = is_string($resource['key'] ?? null) ? $resource['key'] : null;
                if ($key === null || $key === '') {
                    continue;
                }

                $type = is_string($resource['type'] ?? null) ? $resource['type'] : 'text';
                $resourceDefaults[$key] = match ($type) {
                    'number' => 0,
                    'boolean' => false,
                    default => '',
                };
            }

            try {
                $computedValues = $this->formulaEngine->computeAll(
                    array_merge($resourceDefaults, $editableValues),
                    $formulas
                );
            } catch (\Throwable $exception) {
                return 'Cannot compute formula values for selected sheet template.';
            }
        }

        $finalValues = $this->sheetTemplateCatalogBuilder->injectFormulaValues($template, $computedValues, $editableValues);
        $token->setValues($finalValues);

        return null;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function persistRollHistory(DocumentManager $dm, string $sessionId, array $context): void
    {
        $history = new RollHistory();
        $history
            ->setSessionId($sessionId)
            ->setContext($context);

        $dm->persist($history);
        $dm->flush();
    }

    private function normalizeRollMode(mixed $rollMode): string
    {
        if (!is_string($rollMode)) {
            return 'normal';
        }

        $normalized = strtolower(trim($rollMode));
        if (in_array($normalized, ['normal', 'advantage', 'disadvantage'], true)) {
            return $normalized;
        }

        return 'normal';
    }

    /**
     * @param array<int, int|float> $results
     */
    private function resolveSelectedResultIndex(string $rollMode, array $results): ?int
    {
        if (count($results) <= 1) {
            return 0;
        }

        $first = $results[0];
        $second = $results[1];
        if ($first === $second) {
            return null;
        }

        if ($rollMode === 'advantage') {
            return $first > $second ? 0 : 1;
        }

        if ($rollMode === 'disadvantage') {
            return $first < $second ? 0 : 1;
        }

        return 0;
    }

    private function resolveSession(DocumentManager $dm, mixed $sessionId): ?Session
    {
        if (!is_string($sessionId) || $sessionId === '') {
            return null;
        }

        $session = $dm->getRepository(Session::class)->find($sessionId);

        return $session instanceof Session ? $session : null;
    }

    /**
     * Если у токена сохранён sheet не из workshop системы текущей сессии,
     * сбрасываем sheet и values, чтобы форма не работала с несогласованными данными.
     *
     * @param array<string, array<string, mixed>> $catalog
     */
    private function sanitizeTokenSheetTemplateBySessionSystem(Token $token, array $catalog): void
    {
        $sheetTemplateId = $token->getSheetTemplateId();
        if (!is_string($sheetTemplateId) || $sheetTemplateId === '') {
            return;
        }

        $template = $this->sheetTemplateCatalogBuilder->findSheetTemplate(
            $catalog,
            $token->getWorkshopSystemId(),
            $sheetTemplateId
        );
        if (is_array($template)) {
            return;
        }

        $token->setSheetTemplateId(null);
        $token->setValues([]);
    }

    /**
     * @param array<int, array<string, mixed>> $formulas
     */
    private function findSystemFormulaByKey(array $formulas, string $formulaKey): ?array
    {
        foreach ($formulas as $formula) {
            if (!is_array($formula)) {
                continue;
            }

            if (($formula['key'] ?? null) === $formulaKey) {
                return $formula;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeValuesPayload(mixed $payload): ?array
    {
        if ($payload === null || $payload === '') {
            return [];
        }

        if (!is_string($payload)) {
            return null;
        }

        $decoded = json_decode($payload, true);
        if (!is_array($decoded)) {
            return null;
        }

        return $decoded;
    }

    /**
     * Отдельный метод, чтобы не дублировать загрузку картинки между create/edit.
     */
    private function handleTokenImageUpload(FormInterface $form, Token $token): void
    {
        $imageFile = $form->get('imageFile')->getData();
        if ($imageFile === null) {
            return;
        }

        $projectDir = $this->getParameter('kernel.project_dir');
        $uploadDir = $projectDir . '/public/uploads/tokens';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        $extension = $imageFile->guessExtension() ?: 'bin';
        $newFilename = uniqid('token_', true) . '.' . $extension;
        $imageFile->move($uploadDir, $newFilename);
        $token->setImagePath('/uploads/tokens/' . $newFilename);
    }

    /**
     * Добавляем базовые типы токена, чтобы селект tokenType всегда был доступен в форме.
     */
    private function ensureDefaultTokenTypes(DocumentManager $dm): void
    {
        $existing = $dm->getRepository(TokenType::class)->findAll();
        $existingNames = [];

        foreach ($existing as $tokenType) {
            if (!$tokenType instanceof TokenType) {
                continue;
            }

            $name = strtolower(trim($tokenType->getName()));
            if ($name !== '') {
                $existingNames[$name] = true;
            }
        }

        $defaults = [
            'character' => 'Character',
            'monster' => 'Monster',
            'object' => 'Object',
        ];

        $created = false;
        foreach ($defaults as $key => $label) {
            if (isset($existingNames[$key])) {
                continue;
            }

            $tokenType = new TokenType();
            $tokenType->setName($label);
            $dm->persist($tokenType);
            $created = true;
        }

        if ($created) {
            $dm->flush();
        }
    }
}
