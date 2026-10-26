// The credential lives only on the server. Callers select a Marketing API
// resource, never an origin, header, redirect policy or executable.
export async function mailchimpRequest(input, { key = process.env.MAILCHIMP_API_KEY, fetchImpl = fetch } = {}) {
  const fail = (status, error) => ({ status, body: { ok: false, error } });
  if (!key || !/^[a-zA-Z0-9]+-us\d+$/.test(key)) return fail(503, 'Mailchimp key is not configured correctly in Production.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'A request object is required.');
  const method = String(input.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return fail(400, 'Unsupported Mailchimp method.');
  const path = input.path ?? '/';
  // No encoded separators, dot segments, query strings, absolute URLs or
  // backslashes. Queries are separately encoded below.
  if (typeof path !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(path) || path.length > 500) return fail(400, 'Use a relative Mailchimp resource path, such as /lists.');
  // Full Marketing API access is David's explicit choice. A write still needs
  // an intentional call, so a read tool or accidental default cannot send.
  if (method !== 'GET' && input.authorizedWrite !== true) return fail(400, 'Set authorizedWrite only for a write David requested or authorized.');
  if (method === 'GET' && input.body !== undefined) return fail(400, 'GET requests cannot have a body.');
  const query = input.query ?? {};
  if (!query || typeof query !== 'object' || Array.isArray(query)) return fail(400, 'Query must be an object.');
  if (input.body !== undefined && (!input.body || typeof input.body !== 'object' || Array.isArray(input.body))) return fail(400, 'Body must be a JSON object.');
  const dc = key.split('-').at(-1);
  const url = new URL(`https://${dc}.api.mailchimp.com/3.0${path}`);
  for (const [name, value] of Object.entries(query)) {
    if (!/^[a-zA-Z0-9_.\[\]-]+$/.test(name) || !['string', 'number', 'boolean'].includes(typeof value)) return fail(400, 'Query values must be strings, numbers or booleans.');
    url.searchParams.set(name, String(value));
  }
  if (url.href.length > 8000) return fail(400, 'Query is too large.');
  let serialized;
  try { serialized = input.body === undefined ? undefined : JSON.stringify(input.body); }
  catch { return fail(400, 'Body must be JSON.'); }
  if (serialized && Buffer.byteLength(serialized) > 500000) return fail(413, 'Body is too large.');
  const authorization = `Basic ${Buffer.from(`workerbee:${key}`).toString('base64')}`;
  const redact = (value) => {
    if (typeof value === 'string') return value.replaceAll(key, '[redacted]').replaceAll(authorization, '[redacted]');
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([name]) => !/^(_links|api_key|authorization|access_token|refresh_token)$/i.test(name))
      .map(([name, item]) => [name, redact(item)]));
    return value;
  };
  try {
    const response = await fetchImpl(url, {
      method, headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: serialized, redirect: 'error', signal: AbortSignal.timeout(20000)
    });
    // Stream with a bound instead of buffering an unbounded audience export.
    let raw = '';
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2000000) { await reader.cancel(); return fail(502, 'Mailchimp result is too large. Use fields, count and offset to narrow the request. Do not automatically retry a write.'); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    }
    let result;
    try { result = raw ? JSON.parse(raw) : null; }
    catch { return fail(502, 'Mailchimp returned a non-JSON response. Do not automatically retry a write.'); }
    return { status: response.ok ? 200 : response.status, body: {
      ok: response.ok, upstreamStatus: response.status, method, path,
      checkedAt: new Date().toISOString(), result: redact(result)
    } };
  } catch {
    // Never return/log fetch errors that might contain headers or credentials.
    // A timeout is indeterminate for writes, so deliberately no retry here.
    return fail(502, 'Mailchimp request failed or timed out. A write may have succeeded; read the target before retrying.');
  }
}
