<?php

namespace App\Controller;

use App\Document\Token;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class SessionController extends AbstractController
{
    #[Route('/session', name: 'session_index')]
    public function index(DocumentManager $dm): Response
    {
        $tokens = $dm->getRepository(Token::class)->findAll();

        return $this->render('session/index.html.twig', [
            'controller_name' => 'SessionController',
            'tokens' => $tokens,
        ]);
    }
}
