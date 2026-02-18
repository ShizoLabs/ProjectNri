<?php

namespace App\Controller;

use App\Document\WorkshopSystem;
use App\Form\WorkshopSystemSheetTemplatesType;
use App\Service\SheetTemplateCatalogBuilder;
use Doctrine\ODM\MongoDB\DocumentManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Form\FormError;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class SheetTemplateController extends AbstractController
{
    #[Route('/sheet-templates', name: 'sheet_template_index', methods: ['GET'])]
    public function index(DocumentManager $dm, SheetTemplateCatalogBuilder $sheetTemplateCatalogBuilder): Response
    {
        $systems = $dm->getRepository(WorkshopSystem::class)->findAll();
        $catalog = $sheetTemplateCatalogBuilder->buildCatalog($systems);

        return $this->render('sheetTemplate/index.html.twig', [
            'systems' => $catalog,
        ]);
    }

    #[Route('/sheet-templates/system/{id}', name: 'sheet_template_edit', methods: ['GET', 'POST'])]
    public function edit(string $id, Request $request, DocumentManager $dm): Response
    {
        $system = $dm->getRepository(WorkshopSystem::class)->find($id);
        if (!$system instanceof WorkshopSystem) {
            throw $this->createNotFoundException('Workshop system not found.');
        }

        $form = $this->createForm(WorkshopSystemSheetTemplatesType::class, $system);
        $form->handleRequest($request);

        if ($form->isSubmitted()) {
            foreach ($system->validateSheetTemplates() as $error) {
                $form->addError(new FormError($error));
            }
        }

        if ($form->isSubmitted() && $form->isValid()) {
            $dm->persist($system);
            $dm->flush();

            return $this->redirectToRoute('sheet_template_edit', ['id' => $id]);
        }

        return $this->render('sheetTemplate/edit.html.twig', [
            'form' => $form->createView(),
            'system' => $system,
        ]);
    }
}
