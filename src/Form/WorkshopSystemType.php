<?php

namespace App\Form;

use App\Document\WorkshopSystem;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\CallbackTransformer;
use Symfony\Component\Form\Exception\TransformationFailedException;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\Extension\Core\Type\IntegerType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

class WorkshopSystemType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('name', TextType::class, [
            ])
            ->add('slug', TextType::class, [
                'required' => false,
            ])
            ->add('version', IntegerType::class, [
                'required' => false,
                'empty_data' => 1,
                'attr' => [
                    'min' => 1,
                ],
            ]);

        $this->addJsonField($builder, 'settings');
        $this->addJsonField($builder, 'resources');
        $this->addJsonField($builder, 'abilities');
        $this->addJsonField($builder, 'tabs');
        $this->addJsonField($builder, 'formulas');
        $this->addJsonField($builder, 'sheetTemplates');
        $this->addJsonField($builder, 'meta');
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => WorkshopSystem::class,
        ]);
    }

    private function addJsonField(FormBuilderInterface $builder, string $field): void
    {
        $builder->add($field, HiddenType::class, [
            'required' => false,
            'empty_data' => '[]',
        ]);

        $builder->get($field)->addModelTransformer(new CallbackTransformer(
            fn ($value) => $this->encodeJson($value),
            fn ($value) => $this->decodeJson($value, $field)
        ));
    }

    private function encodeJson(?array $value): string
    {
        return json_encode($value ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function decodeJson(?string $value, string $field): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            throw new TransformationFailedException(sprintf('Invalid JSON in %s.', $field));
        }

        return $decoded;
    }
}
