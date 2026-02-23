<?php

namespace App\Form;

use App\Document\Token;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\ChoiceType;
use Symfony\Component\Form\Extension\Core\Type\FileType;
use Symfony\Component\Form\Extension\Core\Type\HiddenType;
use Symfony\Component\Form\Extension\Core\Type\IntegerType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints\Image as ImageConstraint;

class TokenFormType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('name', TextType::class, [
            ])
            ->add('sizeX', IntegerType::class, [
                'label' => 'Size X',
                'attr' => [
                    'min' => 10,
                    'max' => 500,
                ],
            ])
            ->add('sizeY', IntegerType::class, [
                'label' => 'Size Y',
                'attr' => [
                    'min' => 10,
                    'max' => 500,
                ],
            ])
            ->add('rotation', IntegerType::class, [
                'label' => 'Rotation (deg)',
                'attr' => [
                    'min' => 0,
                    'max' => 360,
                ],
            ])
            ->add('workshopSystemId', ChoiceType::class, [
                'required' => false,
                'placeholder' => 'Select workshop system',
                'choices' => $options['workshop_system_choices'],
                'choice_value' => static fn (mixed $choice): string => is_scalar($choice) ? (string) $choice : '',
                'label' => 'Workshop system',
            ])
            ->add('sheetTemplateId', ChoiceType::class, [
                'required' => false,
                'placeholder' => 'Select sheet template',
                'choices' => $options['sheet_template_choices'],
                // Жёстко фиксируем value = id шаблона, чтобы фронт корректно подгружал поля.
                'choice_value' => static fn (mixed $choice): string => is_scalar($choice) ? (string) $choice : '',
                'choice_attr' => static function (mixed $choice, string $key, mixed $value) use ($options): array {
                    $choiceKey = is_scalar($choice) ? (string) $choice : '';
                    if ($choiceKey !== '' && isset($options['sheet_template_choice_attr'][$choiceKey])) {
                        return $options['sheet_template_choice_attr'][$choiceKey];
                    }

                    $valueKey = is_scalar($value) ? (string) $value : '';

                    return $options['sheet_template_choice_attr'][$valueKey] ?? [];
                },
                'label' => 'Sheet template',
            ])
            ->add('valuesJson', HiddenType::class, [
                'required' => false,
                'mapped' => false,
                'empty_data' => '{}',
            ])
            ->add('imageFile', FileType::class, [
                'mapped' => false,
                'required' => false,
                'label' => 'Token image (PNG/JPG/WEBP, max 5MB)',
                'attr' => [
                    'accept' => 'image/png, image/jpeg, image/webp',
                ],
                'constraints' => [
                    new ImageConstraint(
                        maxSize: '5M',
                        mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
                        mimeTypesMessage: 'Разрешены только PNG, JPG или WEBP изображения.',
                    )
                ],
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => Token::class,
            'workshop_system_choices' => [],
            'sheet_template_choices' => [],
            'sheet_template_choice_attr' => [],
        ]);

        $resolver->setAllowedTypes('workshop_system_choices', 'array');
        $resolver->setAllowedTypes('sheet_template_choices', 'array');
        $resolver->setAllowedTypes('sheet_template_choice_attr', 'array');
    }
}
