/*
 * Welcome to your app's main JavaScript file!
 *
 * This file will be included onto the page via the importmap() Twig function,
 * which should already be in your base.html.twig.
 */
import './styles/app.css';

console.log('Test');
$(document).ready(function() {
    /** -----MODAL----- */
    $('.modal').on('click', function () {
        const url = $(this).data('href');

        $.get(url, function (html) {
            $('#modal-root').html(html);
            $('#modal-root .modal-overlay').fadeIn(200);
        });
    });
    // Close modal
    $(document).on('click', '.modal-close', function () {
        $('#modal-root').empty();
    });
    $(document).on('click', '.modal-overlay', function (e) {
        if (e.target === this) {
            $('#modal-root').empty();
        }
    });
});