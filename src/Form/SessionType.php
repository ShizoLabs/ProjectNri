<?php

namespace App\Form;

use App\Document\Session;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\ChoiceType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

class SessionType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('name', TextType::class, [
            ])
            ->add('workshopSystemId', ChoiceType::class, [
                'required' => false,
                'placeholder' => 'Select workshop system',
                'choices' => $options['workshop_system_choices'],
                'choice_value' => static fn (mixed $choice): string => is_scalar($choice) ? (string) $choice : '',
                'label' => 'Workshop system',
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => Session::class,
            'workshop_system_choices' => [],
        ]);

        $resolver->setAllowedTypes('workshop_system_choices', 'array');
    }
}
