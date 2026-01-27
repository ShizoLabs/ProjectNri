<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class TokenController extends AbstractController
{
    #[Route('/token', name: 'app_token')]
    public function index(): Response
    {
        return $this->render('token/index.html.twig', [
            'controller_name' => 'TokenController',
        ]);
    }
}
