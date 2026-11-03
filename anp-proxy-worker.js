/**
 * Proxy CORS para a API pública de Revendedores da ANP.
 *
 * Publique este arquivo como um Cloudflare Worker e defina, no Index.HTML
 * antes do script principal, por exemplo:
 * window.AUTOCONTROL_ANP_PROXY_URL = 'https://seu-worker.seu-subdominio.workers.dev';
 *
 * O Worker recebe: ?uf=GO&municipio=Itumbiara
 * e devolve o JSON da ANP com cache de seis horas.
 */

const ANP_API_URL = 'https://revendedoresapi.anp.gov.br/v1/combustivel';
const CACHE_SECONDS = 60 * 60 * 6;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

export default {
  async fetch(request, _env, context) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Método não permitido.' }, 405);
    }

    const requestUrl = new URL(request.url);
    const uf = (requestUrl.searchParams.get('uf') || '').trim().toUpperCase();
    const municipio = (requestUrl.searchParams.get('municipio') || '').trim();

    if (!/^[A-Z]{2}$/.test(uf) || !/^[\p{L}\s.'-]{2,80}$/u.test(municipio)) {
      return json({ error: 'Informe uma UF válida e um município válido.' }, 400);
    }

    const cache = caches.default;
    const cacheKey = new Request(requestUrl.toString(), request);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    const anpUrl = new URL(ANP_API_URL);
    anpUrl.searchParams.set('uf', uf);
    anpUrl.searchParams.set('municipio', municipio);

    try {
      const upstream = await fetch(anpUrl.toString(), {
        headers: { Accept: 'application/json' }
      });
      const payload = await upstream.json();
      const response = json(payload, upstream.ok ? 200 : upstream.status);
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json({ error: 'Não foi possível consultar a API da ANP neste momento.' }, 502);
    }
  }
};
