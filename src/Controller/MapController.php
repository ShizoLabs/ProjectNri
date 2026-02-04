<?php

namespace App\Controller;

use App\Document\Map;
use App\Form\MapType;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class MapController extends AbstractController
{
    #[Route('/map/create', name: 'map_create', methods: ['GET', 'POST'])]
    public function create(Request $request, DocumentManager $dm): Response
    {
        $sessionId = $request->query->get('session');
        if (!is_string($sessionId) || $sessionId === '') {
            return new Response('Missing session id.', Response::HTTP_BAD_REQUEST);
        }

        $map = new Map();
        $map->setSessionId($sessionId);

        $form = $this->createForm(MapType::class, $map);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($map);
            $dm->flush();

            return $this->redirectToRoute('session_open', [
                'id' => $sessionId,
                'map' => $map->getId(),
            ]);
        }

        return $this->render('map/create.html.twig', [
            'form' => $form->createView(),
            'sessionId' => $sessionId,
        ]);
    }
}
