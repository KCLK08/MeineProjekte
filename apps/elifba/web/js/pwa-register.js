(function () {
  if (!('serviceWorker' in navigator)) return;
  if (!(window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;

  function getBasePath() {
    var script = document.currentScript;
    var src = script && script.src ? script.src : '';

    if (src) {
      var url = new URL(src, window.location.href);
      return url.pathname.replace(/js\/pwa-register\.js(?:\?.*)?$/, '');
    }

    var path = window.location.pathname.replace(/\\/g, '/');
    var idx = path.indexOf('/kapitel/');
    if (idx !== -1) return path.slice(0, idx + 1);
    return path.slice(0, path.lastIndexOf('/') + 1);
  }

  window.addEventListener('load', function () {
    var base = getBasePath();
    var swUrl = base + 'sw.js';

    navigator.serviceWorker.register(swUrl, { scope: base }).catch(function (err) {
      console.error('Service Worker Registrierung fehlgeschlagen:', err);
    });
  });
})();
