import './styles/app.css';

$(document).ready(function() {
    // Open modal
    $(document).on('click', '.modal', function (e) {
        e.preventDefault();

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
    // Ajax form send
    $(document).on('submit', '#modal-root form', function (e) {
        e.preventDefault();

        const form = $(this);
        const url = form.attr('action');
        const method = form.attr('method') || 'POST';
        const formData = new FormData(this);

        $.ajax({
            url: url,
            type: method,
            data: formData,
            processData: false,   // important for FormData
            contentType: false,   // also FormData
            success: function (response) {
                // Success
                if (typeof response === 'object' && response.success) {
                    window.location.href = response.redirect;
                    return;
                }
                // Else validation error
                $('#modal-root').html(response);
            },
            error: function (xhr) {
                console.error('AJAX error:', xhr);
            }
        });
    });
});