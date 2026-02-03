<?php

namespace App\Controller;

use App\Document\Token;
use App\Form\TokenType;
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

        $form = $this->createForm(TokenType::class, $token);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($token);
            $dm->flush();

            return $this->redirectToRoute('session_index');
        }

        return $this->render('token/create.html.twig', [
            'form' => $form->createView(),
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

        $dm->persist($token);
        $dm->flush();

        return $this->json(['ok' => true]);
    }
}
