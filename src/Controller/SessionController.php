<?php

namespace App\Controller;

use App\Document\Session;
use App\Document\Token;
use App\Document\Map;
use App\Form\SessionType;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class SessionController extends AbstractController
{
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

        $form = $this->createForm(SessionType::class, $session);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($session);
            $dm->flush();

            $map = new Map();
            $map->setName($session->getName());
            $map->setSessionId($session->getId());
            $dm->persist($map);
            $dm->flush();

            return $this->redirectToRoute('session_index');
        }

        return $this->render('session/create.html.twig', [
            'form' => $form->createView(),
        ]);
    }
    /** Init open session by id */
    #[Route('/session/{id}', name: 'session_open')]
    public function openSession(Session $session, Request $request, DocumentManager $dm): Response
    {
        $sessionId = $session->getId();
        $tokens = $dm->getRepository(Token::class)->findBy(['sessionId' => $sessionId]);
        $maps = $dm->getRepository(Map::class)->findBy(['sessionId' => $sessionId]);

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
                    'sizeX' => $sessionToken->getSizeX(),
                    'sizeY' => $sessionToken->getSizeY(),
                    'rotation' => $sessionToken->getRotation(),
                    'imagePath' => $sessionToken->getImagePath(),
                ];
            }
            if ($sessionToken->getMapId() === null && $sessionToken->getTemplateId() === null) {
                $templateTokens[] = $sessionToken;
            }
        }

        return $this->render('session/session.html.twig', [
            'tokens' => $tokensData,
            'sessionTokens' => $templateTokens,
            'sessionId' => $sessionId,
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
}
