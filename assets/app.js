/*
 * Welcome to your app's main JavaScript file!
 *
 * This file will be included onto the page via the importmap() Twig function,
 * which should already be in your base.html.twig.
 */
import './styles/app.css';

$(document).ready(function() {
const dialog = document.querySelector('dialog');
let isDragging = false;
let offset = { x: 0, y: 0 };

dialog.addEventListener('mousedown', (e) => {
    isDragging = true;
    offset.x = e.clientX - dialog.getBoundingClientRect().left;
    offset.y = e.clientY - dialog.getBoundingClientRect().top;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    dialog.style.left = (e.clientX - offset.x) + 'px';
    dialog.style.top = (e.clientY - offset.y) + 'px';
    dialog.style.margin = '0';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});
});