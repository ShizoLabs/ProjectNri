<?php

namespace App\Controller;

use App\Document\WorkshopSystem;
use App\Form\WorkshopSystemType;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class WorkshopSystemController extends AbstractController
{
    #[Route('/workshop/system', name: 'workshop_system_index')]
    public function index(): Response
    {
        return $this->redirectToRoute('workshop_index');
    }

    #[Route('/workshop/system/create', name: 'workshop_system_create', methods: ['GET', 'POST'])]
    public function create(Request $request, DocumentManager $dm): Response
    {
        $system = new WorkshopSystem();

        $form = $this->createForm(WorkshopSystemType::class, $system);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($system);
            $dm->flush();

            if ($request->isXmlHttpRequest()) {
                return $this->json([
                    'success' => true,
                    'redirect' => $this->generateUrl('workshop_index'),
                ]);
            }

            return $this->redirectToRoute('workshop_index');
        }

        return $this->render('workshopSystem/create.html.twig', [
            'form' => $form->createView(),
        ]);
    }

    #[Route('/workshop/system/{id}', name: 'workshop_system_open', methods: ['GET'])]
    public function open(WorkshopSystem $system): Response
    {
        return $this->render('workshopSystem/open.html.twig', [
            'system' => $system,
        ]);
    }

    #[Route('/workshop/system/{id}/edit', name: 'workshop_system_edit', methods: ['GET', 'POST'])]
    public function edit(string $id, Request $request, DocumentManager $dm): Response
    {
        $repo = $dm->getRepository(WorkshopSystem::class);
        $system = $repo->find($id);
        if (!$system) {
            return $this->json(['error' => 'Workshop system not found'], 404);
        }

        $form = $this->createForm(WorkshopSystemType::class, $system);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($system);
            $dm->flush();

            if ($request->isXmlHttpRequest()) {
                return $this->json([
                    'success' => true,
                    'redirect' => $this->generateUrl('workshop_index'),
                ]);
            }

            return $this->redirectToRoute('workshop_index');
        }

        return $this->render('workshopSystem/edit.html.twig', [
            'form' => $form->createView(),
            'systemId' => $system->getId(),
        ]);
    }

    #[Route('/workshop/system/{id}/delete', name: 'workshop_system_delete', methods: ['POST'])]
    public function delete(string $id, Request $request, DocumentManager $dm): Response
    {
        $repo = $dm->getRepository(WorkshopSystem::class);
        $system = $repo->find($id);
        if (!$system) {
            return new JsonResponse(['error' => 'Workshop system not found'], 404);
        }

        $dm->remove($system);
        $dm->flush();

        if ($request->isXmlHttpRequest()) {
            return $this->json([
                'success' => true,
                'redirect' => $this->generateUrl('workshop_index'),
            ]);
        }

        return $this->redirectToRoute('workshop_index');
    }
}
