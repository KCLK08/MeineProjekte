/**
 * Serves APKs from R2 at /apks/*; all other paths use Workers static assets.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/apks/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const key = decodeURIComponent(url.pathname.slice('/apks/'.length));
    if (!key || key.includes('/') || key.includes('..') || !key.endsWith('.apk')) {
      return new Response('Not found', { status: 404 });
    }

    const obj = await env.APKS.get(key);
    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    headers.set('Content-Disposition', `attachment; filename="${key}"`);
    headers.set('Cache-Control', 'public, max-age=300');
    if (obj.size != null) {
      headers.set('Content-Length', String(obj.size));
    }
    if (obj.httpEtag) {
      headers.set('ETag', obj.httpEtag);
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    return new Response(obj.body, { status: 200, headers });
  },
};
