<?php

namespace App\Controller;

use App\Document\Token;
use App\Form\TokenFormType;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class TokenController extends AbstractController
{
    #[Route('/token/create', name: 'token_create')]
    public function index(Request $request, DocumentManager $dm): Response
    {
        $token = new Token();
        $sessionId = $request->query->get('session');
        if (is_string($sessionId) && $sessionId !== '') {
            $token->setSessionId($sessionId);
        }

        $form = $this->createForm(TokenFormType::class, $token);
        $form->handleRequest($request);
        
        if ($form->isSubmitted() && $form->isValid()) {
            $imageFile = $form->get('imageFile')->getData();
            if ($imageFile) {
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

            $dm->persist($token);
            $dm->flush();

            if ($request->isXmlHttpRequest()) {
                return $this->json([
                    'success' => true,
                    'redirect' => $this->generateUrl('session_open', ['id' => $sessionId]),
                ]);
            }

            return $this->redirectToRoute('session_index');
        }

        return $this->render('token/create.html.twig', [
            'form' => $form->createView(),
            'sessionId' => $sessionId,
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

        $dm->persist($token);
        $dm->flush();

        return $this->json([
            'id' => $token->getId(),
            'name' => $token->getName(),
            'x' => $token->getX(),
            'y' => $token->getY(),
            'mapId' => $token->getMapId(),
            'sizeX' => $token->getSizeX(),
            'sizeY' => $token->getSizeY(),
            'rotation' => $token->getRotation(),
            'imagePath' => $token->getImagePath(),
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

        $dm->remove($token);
        $dm->flush();

        return $this->json(['ok' => true]);
    }
}
