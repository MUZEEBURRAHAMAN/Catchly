// Catchly — waitlist signup worker.
//
// Endpoints
//   POST /signup     { email, source, version, dismissedCount }
//                    -> { ok: true } | { ok: false, error }
//   OPTIONS *        CORS preflight
//   any other route  404 { ok: false, error: 'not_found' }
//
// Storage: Workers KV namespace bound as `WAITLIST`.
// Keys:    signup:<timestamp>:<random8>
// Value:   JSON { email, source, version, dismissedCount, ts }
//
// Privacy: no IP, no user-agent, no headers persisted. Only what the
// client submits.
//
// CORS policy
//   We don't echo "*". Instead we match the request's Origin header
//   against an allowlist of patterns:
//     - chrome-extension://<32 lowercase a–p chars>  (any packed
//       Chrome extension id — Chrome generates ids from this alphabet)
//     - https://getcatchly.com / https://www.getcatchly.com (the
//       landing page, in case a future direct-from-site signup form
//       is added)
//   If the Origin doesn't match we still respond with JSON so the
//   server-side debug story is sane, but we set
//   Access-Control-Allow-Origin: "null" so the browser blocks the
//   response from reaching unauthorized JS. Vary: Origin keeps caches
//   from mixing allowed/blocked responses.

const ORIGIN_ALLOWLIST = [
  /^chrome-extension:\/\/[a-p]{32}$/,
  /^https:\/\/getcatchly\.com$/,
  /^https:\/\/www\.getcatchly\.com$/
];

function corsHeaders(origin) {
  const allowed = typeof origin === 'string' && ORIGIN_ALLOWLIST.some(re => re.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400'
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200, origin = null, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin), ...extra }
  });
}

function clip(s, n) {
  return (s || '').toString().slice(0, n);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const isAllowedOrigin = typeof origin === 'string' && ORIGIN_ALLOWLIST.some(re => re.test(origin));

    if (request.method === 'OPTIONS') {
      if (origin && !isAllowedOrigin) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Block non-whitelisted cross-origin callers from submitting to the waitlist
    if (origin && !isAllowedOrigin) {
      return json({ ok: false, error: 'forbidden' }, 403, null);
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/signup') {
      return json({ ok: false, error: 'not_found' }, 404, origin);
    }

    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 10240) {
      return json({ ok: false, error: 'payload_too_large' }, 413, origin);
    }

    let payload;
    try { payload = await request.json(); }
    catch { return json({ ok: false, error: 'invalid_json' }, 400, origin); }

    const email = clip(payload?.email, 254).trim().toLowerCase();
    if (!email || email.length < 3 || !EMAIL_RE.test(email)) {
      return json({ ok: false, error: 'invalid_email' }, 400, origin);
    }

    const source = clip(payload?.source, 32) || 'unknown';
    const version = clip(payload?.version, 16) || 'unknown';
    const dismissedCount = Number.isFinite(payload?.dismissedCount) ? payload.dismissedCount : 0;
    const ts = Date.now();
    const rand = crypto.randomUUID().slice(0, 8);
    const key = `signup:${ts}:${rand}`;
    const value = JSON.stringify({ email, source, version, dismissedCount, ts });

    try {
      await env.WAITLIST.put(key, value);
      return json({ ok: true }, 200, origin);
    } catch (err) {
      return json({ ok: false, error: 'storage_error' }, 500, origin);
    }
  }
};
