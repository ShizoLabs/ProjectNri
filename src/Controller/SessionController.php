<?php

namespace App\Controller;

use App\Document\Session;
use App\Document\Token;
use App\Document\Map;
use App\Document\WorkshopSystem;
use App\Form\SessionType;
use App\Service\SheetTemplateCatalogBuilder;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class SessionController extends AbstractController
{
    public function __construct(
        private readonly SheetTemplateCatalogBuilder $sheetTemplateCatalogBuilder,
    ) {
    }

    /** Session menu */
    #[Route('/session', name: 'session_index')]
    public function index(DocumentManager $dm): Response 
    {
        $sessions = $dm->getRepository(Session::class)->findAll();

        return $this->render('session/index.html.twig', [
            'sessions' => $sessions,
        ]);
    }
    /** Create new session. Create and connect default map */
    #[Route('/session/create', name: 'session_create', methods: ['GET', 'POST'])]
    public function create(Request $request, DocumentManager $dm): Response 
    {
        $session = new Session();

        $form = $this->createForm(SessionType::class, $session, $this->buildSessionFormOptions($dm));
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($session);
            $dm->flush();

            $map = new Map();
            $map->setName($session->getName());
            $map->setSessionId($session->getId());
            $dm->persist($map);
            $dm->flush();
            // If AJAX
            if ($request->isXmlHttpRequest()) {
                return $this->json([
                    'success' => true,
                    'redirect' => $this->generateUrl('session_index')
                ]);
            }
            
            return $this->redirectToRoute('session_index');
        }
        // If invalid AJAX
        if ($request->isXmlHttpRequest()) {
            return $this->render('session/create.html.twig', [
                'form' => $form->createView(),
            ]);
        }
        return $this->render('session/create.html.twig', [
            'form' => $form->createView(),
        ]);
    }

    #[Route('/session/{id}/edit', name: 'session_edit', methods: ['GET', 'POST'])]
    public function edit(Session $session, Request $request, DocumentManager $dm): Response
    {
        $previousWorkshopSystemId = $session->getWorkshopSystemId();
        $form = $this->createForm(SessionType::class, $session, $this->buildSessionFormOptions($dm));
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $workshopSystemChanged = $previousWorkshopSystemId !== $session->getWorkshopSystemId();

            $dm->persist($session);

            if ($workshopSystemChanged) {
                $this->syncSessionTokensWorkshopSystem($session, $dm);
            }

            $dm->flush();

            $redirect = $this->generateUrl('session_open', ['id' => $session->getId()]);
            if ($request->isXmlHttpRequest()) {
                return $this->json([
                    'success' => true,
                    'redirect' => $redirect,
                ]);
            }

            return $this->redirectToRoute('session_open', ['id' => $session->getId()]);
        }

        return $this->render('session/edit.html.twig', [
            'form' => $form->createView(),
            'sessionId' => $session->getId(),
        ]);
    }

    /** Init open session by id */
    #[Route('/session/{id}', name: 'session_open')]
    public function openSession(Session $session, Request $request, DocumentManager $dm): Response
    {
        $sessionId = $session->getId();
        $tokens = $dm->getRepository(Token::class)->findBy(['sessionId' => $sessionId]);
        $maps = $dm->getRepository(Map::class)->findBy(['sessionId' => $sessionId]);
        $sheetCatalog = $this->sheetTemplateCatalogBuilder->buildCatalog(
            $dm->getRepository(WorkshopSystem::class)->findAll()
        );
        $sessionWorkshopSystemId = $session->getWorkshopSystemId();
        $sessionWorkshopSystem = is_string($sessionWorkshopSystemId) ? ($sheetCatalog[$sessionWorkshopSystemId] ?? null) : null;
        $sessionWorkshopSystemName = is_array($sessionWorkshopSystem) && is_string($sessionWorkshopSystem['name'] ?? null)
            ? $sessionWorkshopSystem['name']
            : null;
        $sessionFormulas = [];
        if (is_array($sessionWorkshopSystem)) {
            $formulas = is_array($sessionWorkshopSystem['formulas'] ?? null) ? $sessionWorkshopSystem['formulas'] : [];
            foreach ($formulas as $formula) {
                if (!is_array($formula)) {
                    continue;
                }

                $key = $formula['key'] ?? null;
                $name = $formula['name'] ?? null;
                $expression = $formula['expression'] ?? null;
                if (!is_string($key) || $key === '' || !is_string($expression)) {
                    continue;
                }

                $sessionFormulas[] = [
                    'key' => $key,
                    'name' => is_string($name) && $name !== '' ? $name : $key,
                    'expression' => $expression,
                ];
            }
        }

        $mapIdParam = $request->query->get('map');
        $map = null;
        if (is_string($mapIdParam) && $mapIdParam !== '') {
            $candidate = $dm->getRepository(Map::class)->find($mapIdParam);
            if ($candidate !== null && $candidate->getSessionId() === $sessionId) {
                $map = $candidate;
            }
        }
        if ($map === null) {
            $map = $maps[0] ?? null;
        }

        $tokensData = [];
        $templateTokens = [];

        $mapId = $map?->getId();
        foreach ($tokens as $sessionToken) {
            if ($mapId !== null && $sessionToken->getMapId() === $mapId) {
                $tokensData[] = [
                    'id' => $sessionToken->getId(),
                    'name' => $sessionToken->getName(),
                    'x' => $sessionToken->getX(),
                    'y' => $sessionToken->getY(),
                    'templateId' => $sessionToken->getTemplateId(),
                    'sizeX' => $sessionToken->getSizeX(),
                    'sizeY' => $sessionToken->getSizeY(),
                    'rotation' => $sessionToken->getRotation(),
                    'imagePath' => $sessionToken->getImagePath(),
                ];
            }
            if ($sessionToken->getMapId() === null && $sessionToken->getTemplateId() === null) {
                $sheetTemplate = $this->sheetTemplateCatalogBuilder->findSheetTemplate(
                    $sheetCatalog,
                    $sessionToken->getWorkshopSystemId(),
                    $sessionToken->getSheetTemplateId()
                );

                $templateTokens[] = [
                    'id' => $sessionToken->getId(),
                    'name' => $sessionToken->getName(),
                    'imagePath' => $sessionToken->getImagePath(),
                    'sheetTemplateName' => is_array($sheetTemplate) ? ($sheetTemplate['name'] ?? null) : null,
                ];
            }
        }

        return $this->render('session/session.html.twig', [
            'tokens' => $tokensData,
            'sessionTokens' => $templateTokens,
            'sessionId' => $sessionId,
            'sessionName' => $session->getName(),
            'sessionWorkshopSystemId' => $sessionWorkshopSystemId,
            'sessionWorkshopSystemName' => $sessionWorkshopSystemName,
            'sessionFormulas' => $sessionFormulas,
            'map' => $map ? [
                'id' => $map->getId(),
                'name' => $map->getName(),
                'width' => $map->getWidth(),
                'height' => $map->getHeight(),
            ] : null,
            'sessionMaps' => array_map(static function (Map $map) {
                return [
                    'id' => $map->getId(),
                    'name' => $map->getName(),
                    'width' => $map->getWidth(),
                    'height' => $map->getHeight(),
                ];
            }, $maps),
        ]);
    }

    private function buildSessionFormOptions(DocumentManager $dm): array
    {
        $catalog = $this->sheetTemplateCatalogBuilder->buildCatalog(
            $dm->getRepository(WorkshopSystem::class)->findAll()
        );

        return [
            'workshop_system_choices' => $this->sheetTemplateCatalogBuilder->buildSystemChoices($catalog),
        ];
    }

    private function syncSessionTokensWorkshopSystem(Session $session, DocumentManager $dm): void
    {
        $sessionId = $session->getId();
        if (!is_string($sessionId) || $sessionId === '') {
            return;
        }

        $tokens = $dm->getRepository(Token::class)->findBy(['sessionId' => $sessionId]);
        foreach ($tokens as $token) {
            if (!$token instanceof Token) {
                continue;
            }

            $token->setWorkshopSystemId($session->getWorkshopSystemId());
            $token->setSheetTemplateId(null);
            $token->setValues([]);
            $dm->persist($token);
        }
    }
}
