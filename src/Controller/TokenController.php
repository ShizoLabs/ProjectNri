<?php

namespace App\Controller;

use App\Document\Token;
use App\Form\TokenType;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
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
}
