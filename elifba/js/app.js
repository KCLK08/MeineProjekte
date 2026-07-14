(function () {
  const audioCells = document.querySelectorAll('[data-audio]');

  function playAudio(path) {
    if (!path) return;
    const audio = new Audio(path);
    audio.play();
  }

  audioCells.forEach((cell) => {
    cell.addEventListener('click', () => {
      const src = cell.getAttribute('data-audio');
      playAudio(src);
    });
  });
})();
