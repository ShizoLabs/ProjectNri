<?php

namespace App\Form;

use App\Document\WorkshopSystem;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\CallbackTransformer;
use Symfony\Component\Form\Exception\TransformationFailedException;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

class WorkshopSystemSheetTemplatesType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('sheetTemplates', HiddenType::class, [
            'required' => false,
            'empty_data' => '[]',
        ]);

        $builder->get('sheetTemplates')->addModelTransformer(new CallbackTransformer(
            fn ($value) => $this->encodeJson($value),
            fn ($value) => $this->decodeJson($value)
        ));
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => WorkshopSystem::class,
        ]);
    }

    private function encodeJson(?array $value): string
    {
        return json_encode($value ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function decodeJson(?string $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            throw new TransformationFailedException('Invalid JSON in sheetTemplates.');
        }

        return $decoded;
    }
}
