<?php

namespace App\Form;

use App\Document\Token;
use App\Document\TokenType;
use Doctrine\Bundle\MongoDBBundle\Form\Type\DocumentType;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\FileType;
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
            ->add('tokenType', DocumentType::class, [
                'required' => false,
                'class' => TokenType::class,
                'choice_label' => 'name',
                'placeholder' => 'No type',
                'label' => 'Token type',
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
        ]);
    }
}
