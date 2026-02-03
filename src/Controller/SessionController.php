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
    public function openSession(Session $session, DocumentManager $dm): Response
    {
        $sessionId = $session->getId();
        $tokens = $dm->getRepository(Token::class)->findBy(['sessionId' => $sessionId]);
        $map = $dm->getRepository(Map::class)->findOneBy(['sessionId' => $sessionId]);

        $tokensData = [];

        $mapId = $map?->getId();
        foreach ($tokens as $sessionToken) {
            if ($mapId !== null && $sessionToken->getMapId() === $mapId) {
                $tokensData[] = [
                    'id' => $sessionToken->getId(),
                    'name' => $sessionToken->getName(),
                    'x' => $sessionToken->getX(),
                    'y' => $sessionToken->getY(),
                ];
            }
        }

        return $this->render('session/session.html.twig', [
            'tokens' => $tokensData,
            'sessionTokens' => $tokens,
            'sessionId' => $sessionId,
            'map' => $map ? [
                'id' => $map->getId(),
                'name' => $map->getName(),
                'width' => $map->getWidth(),
                'height' => $map->getHeight(),
            ] : null,
        ]);
    }
}
