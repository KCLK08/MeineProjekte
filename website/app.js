const CATALOG = [
  {
    slug: 'bautagebuch',
    name: 'Bautagebuch',
    description:
      'Expo-Bautagebuch (eBTB) – aktuelle App wie im Bautagebuch-Repo, auch im Browser.',
    hasWeb: true,
    hasApk: true,
    accent: '#12534b',
    apkFile: 'Bautagebuch.apk',
    versionFallback: '1.0.1',
    icon: './assets/bautagebuch-icon.png',
  },
  {
    slug: 'buew-toolbox',
    name: 'BÜW-Toolbox',
    description: 'Tools für Bauüberwacher: SiteReport, Protokolle und Workflows.',
    hasWeb: true,
    hasApk: true,
    accent: '#1a3a5c',
    apkFile: 'BuewToolbox.apk',
    versionFallback: '1.0.0',
  },
  {
    slug: 'ds-datenbank',
    name: 'DS-Datenbank',
    description: 'DS-Angriffsplaner – Planung und Datenbank für den Browser und als App.',
    hasWeb: true,
    hasApk: true,
    accent: '#2563eb',
    apkFile: 'DSDatenbank.apk',
    versionFallback: '1.0.0',
  },
  {
    slug: 'elifba',
    name: 'ELIFBA',
    description: 'Lernweg zum Lesen des Korans – klar strukturiert, mit Audio.',
    hasWeb: true,
    hasApk: true,
    accent: '#b44d2a',
    apkFile: 'Elifba.apk',
    versionFallback: '1.0.0',
  },
  {
    slug: 'familydata',
    name: 'Family Vault',
    description: 'Family Vault – privater Familienordner, offline, nur mobil (kein Web).',
    hasWeb: false,
    hasApk: true,
    accent: '#1b4332',
    apkFile: 'FamilyVault.apk',
    versionFallback: '1.0.0',
    icon: './assets/family-vault-icon.png',
  },
];

function pagesWebUrl(slug) {
  return new URL(`./apps/${slug}/`, window.location.href).href;
}

function apkDownloadUrl(apkFile, metaUrl) {
  if (metaUrl && (metaUrl.startsWith('/') || metaUrl.startsWith('./') || metaUrl.startsWith('http'))) {
    return new URL(metaUrl, window.location.href).href;
  }
  return new URL(`./apks/${apkFile}`, window.location.href).href;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function probeApk(url) {
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return true;
  } catch {
    /* ignore */
  }
  try {
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
    });
    return get.ok || get.status === 206;
  } catch {
    return false;
  }
}

async function fetchRelease(slug, apkFile, versionFallback) {
  let meta = {};
  try {
    const local = await fetch('./releases.json', { cache: 'no-store' });
    if (local.ok) {
      const json = await local.json();
      meta = json[slug] || {};
    }
  } catch {
    /* ignore */
  }

  const apkUrl = apkDownloadUrl(apkFile, meta.apkUrl);
  const ready = await probeApk(apkUrl);

  return {
    version: meta.version || versionFallback || '—',
    buildDate: meta.buildDate || null,
    apkUrl,
    ready,
  };
}

function renderApp(app, release) {
  const el = document.createElement('article');
  el.className = 'app';
  const iconHtml = app.icon
    ? `<img class="app-icon" src="${app.icon}" alt="" width="48" height="48" />`
    : `<span class="swatch" style="background:${app.accent}" aria-hidden="true"></span>`;
  el.innerHTML = `
    <div class="app-top">
      <div class="app-heading">
        ${iconHtml}
        <h2>${app.name}</h2>
      </div>
    </div>
    <p>${app.description}</p>
    <div class="meta">
      <span>Version <strong>${release.version || '—'}</strong></span>
      <span>Build <strong>${formatDate(release.buildDate)}</strong></span>
    </div>
    <div class="actions"></div>
  `;
  const actions = el.querySelector('.actions');

  if (app.hasWeb) {
    const web = document.createElement('a');
    web.className = 'btn btn-secondary';
    web.href = pagesWebUrl(app.slug);
    web.textContent = 'Web öffnen';
    actions.appendChild(web);
  }

  const apk = document.createElement(release.ready ? 'a' : 'span');
  apk.className = 'btn btn-primary';
  if (release.ready) {
    apk.href = release.apkUrl;
    apk.textContent = 'APK herunterladen';
  } else {
    apk.setAttribute('aria-disabled', 'true');
    apk.textContent = 'APK folgt';
  }
  actions.appendChild(apk);

  return el;
}

async function main() {
  const grid = document.getElementById('app-grid');
  const results = await Promise.all(
    CATALOG.map(async (app) => ({
      app,
      release: await fetchRelease(app.slug, app.apkFile, app.versionFallback),
    })),
  );
  for (const { app, release } of results) {
    grid.appendChild(renderApp(app, release));
  }
}

main();
