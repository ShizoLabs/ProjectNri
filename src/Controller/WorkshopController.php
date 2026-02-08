<?php

namespace App\Controller;

use App\Document\WorkshopSystem;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class WorkshopController extends AbstractController
{
    #[Route('/workshop', name: 'workshop_index')]
    public function index(DocumentManager $dm): Response
    {
        $systems = $dm->getRepository(WorkshopSystem::class)->findAll();

        return $this->render('workshop/index.html.twig', [
            'systems' => $systems,
        ]);
    }
}
