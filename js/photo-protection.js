for (const type of ['contextmenu', 'dragstart']) {
  document.addEventListener(type, event => {
    if (event.target.closest('[data-protected-photo], .gallery, .lightbox-image-container')) {
      event.preventDefault();
    }
  });
}
