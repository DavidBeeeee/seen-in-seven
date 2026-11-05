/* Counts what the browser reads straight from Supabase (WBR-458), so the 60/80/95
   percent warnings see more than the /api functions. Sampled by page load: an
   unsampled page passes every request through untouched. Sizes and table names
   only, never content, and a failure here never touches the request. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StudioEgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var EVENT = 'studio_egress_response';
  var MEMBER_SAMPLE_EVERY = 10;
  var MAX_EVENT_BYTES = 64 * 1024 * 1024;

  function readerFor(url) {
    var path = '';
    try { path = new URL(String(url)).pathname; } catch (error) { return 'other'; }
    var rest = path.match(/\/rest\/v1\/(?:rpc\/)?([^/?]+)/);
    if (rest) return rest[1];
    if (path.indexOf('/storage/v1/') !== -1) return 'storage';
    if (path.indexOf('/auth/v1/') !== -1) return 'auth';
    return 'other';
  }

  function byteCount(text) {
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : String(text).length;
  }

  function bearerFrom(init) {
    var headers = init && init.headers;
    if (!headers) return { apikey: '', authorization: '' };
    var get = typeof headers.get === 'function'
      ? function (name) { return headers.get(name) || ''; }
      : function (name) { return headers[name] || headers[name.toLowerCase()] || ''; };
    return { apikey: get('apikey'), authorization: get('Authorization') };
  }

  function createMeter(options) {
    var fetchImpl = options.fetchImpl;
    var sampleEvery = options.sampleEvery || MEMBER_SAMPLE_EVERY;
    var sampled = (options.random || Math.random)() < 1 / sampleEvery;
    var totals = {};
    var pending = [];
    var auth = null;
    var base = '';

    function add(reader, bytes) {
      if (sampled && bytes > 0) totals[reader] = (totals[reader] || 0) + bytes;
    }

    function meteredFetch(url, init) {
      if (!sampled) return fetchImpl(url, init);
      var reader = readerFor(url);
      var request = fetchImpl(url, init);
      if (String(url).indexOf('/rpc/record_log_event') !== -1) return request;
      try {
        var seen = bearerFrom(init);
        // The anon key is not a member, and the database drops an event without one.
        if (seen.authorization && seen.apikey && seen.authorization !== 'Bearer ' + seen.apikey) auth = seen;
        if (!base) base = new URL(String(url)).origin;
      } catch (error) { /* Observability never breaks the app. */ }
      pending.push(request.then(function (response) {
        return response.clone().text().then(function (text) { add(reader, byteCount(text)); });
      }).catch(function () {}));
      return request;
    }

    function flush() {
      var names = Object.keys(totals);
      if (!names.length || !auth || !base) return null;
      var total = names.reduce(function (sum, name) { return sum + totals[name]; }, 0);
      var top = names.sort(function (a, b) { return totals[b] - totals[a]; });
      var readers = {};
      top.slice(0, 5).forEach(function (name) { readers[name] = totals[name] * sampleEvery; });
      totals = {};
      return fetchImpl(base + '/rest/v1/rpc/record_log_event', {
        method: 'POST',
        keepalive: true,
        headers: { apikey: auth.apikey, Authorization: auth.authorization, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          p_event_type: EVENT,
          p_detail: {
            schema: 1,
            route: 'client:' + options.page,
            reader: top[0],
            bytes: Math.min(total * sampleEvery, MAX_EVENT_BYTES),
            sampled: sampleEvery,
            readers: readers
          }
        })
      }).catch(function () {});
    }

    return {
      sampled: sampled,
      fetch: meteredFetch,
      // A read the client cannot see, such as a signed Storage URL the browser opens.
      note: add,
      settle: function () { return Promise.all(pending); },
      flush: flush
    };
  }

  var pageMeter = null;

  function meterForPage() {
    if (pageMeter || !root.fetch || !root.location) return pageMeter;
    var page = String(root.location.pathname || '/').split('/').filter(Boolean)[0] || 'home';
    pageMeter = createMeter({
      page: page.replace(/\.html$/, ''),
      // The admin pages are David's and the heaviest, so every load is counted.
      sampleEvery: /^admin/.test(page) ? 1 : MEMBER_SAMPLE_EVERY,
      fetchImpl: root.fetch.bind(root)
    });
    if (pageMeter.sampled && root.addEventListener) {
      root.addEventListener('pagehide', pageMeter.flush);
      root.addEventListener('visibilitychange', function () {
        if (root.document && root.document.visibilityState === 'hidden') pageMeter.flush();
      });
    }
    return pageMeter;
  }

  return {
    createMeter: createMeter,
    readerFor: readerFor,
    MEMBER_SAMPLE_EVERY: MEMBER_SAMPLE_EVERY,
    clientOptions: function () {
      var meter = meterForPage();
      return meter ? { global: { fetch: meter.fetch } } : undefined;
    },
    note: function (reader, bytes) {
      var meter = meterForPage();
      if (meter) meter.note(reader, bytes);
    }
  };
});
