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
];

const OWNER = 'KCLK08';
const REPO = 'MeineProjekte';

function pagesWebUrl(slug) {
  return new URL(`./apps/${slug}/`, window.location.href).href;
}

function releaseTag(slug) {
  return `${slug}-apk-latest`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function fetchRelease(slug, apkFile, versionFallback) {
  const tag = releaseTag(slug);
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const asset =
      (data.assets || []).find((a) => a.name === apkFile) ||
      (data.assets || []).find((a) => a.name.endsWith('.apk'));
    return {
      version: versionFallback || data.name || data.tag_name || '—',
      buildDate: data.published_at || data.created_at,
      apkUrl: asset?.browser_download_url || null,
      ready: Boolean(asset?.browser_download_url),
    };
  } catch {
    try {
      const local = await fetch('./releases.json', { cache: 'no-store' });
      if (local.ok) {
        const json = await local.json();
        if (json[slug]) {
          return {
            version: json[slug].version || versionFallback || '—',
            buildDate: json[slug].buildDate,
            apkUrl: json[slug].apkUrl,
            ready: false,
          };
        }
      }
    } catch {
      /* ignore */
    }
    return {
      version: versionFallback || '—',
      buildDate: null,
      apkUrl: null,
      ready: false,
    };
  }
}

function renderApp(app, release) {
  const el = document.createElement('article');
  el.className = 'app';
  el.innerHTML = `
    <div class="app-top">
      <h2>${app.name}</h2>
      <span class="swatch" style="background:${app.accent}" aria-hidden="true"></span>
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
