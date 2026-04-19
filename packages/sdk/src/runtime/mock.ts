/**
 * Mock runtime bootstrap for `axon run-local`.
 *
 * Returns a JavaScript string that, when injected via `node --import`,
 * sets up both `globalThis.phonix` and `globalThis._STD_` (for backward
 * compatibility with templates that still reference _STD_ directly).
 *
 * The mock:
 *  - Simulates an immediate WebSocket connection and fires a test message
 *  - Performs real HTTPS requests for http.GET / http.POST (blocks private IPs)
 *  - Logs all operations to stdout for developer visibility
 */
export function mockRuntimeBootstrap(): string {
  return `
// ─── AxonSDK Runtime Mock (run-local mode) ───────────────────────────────────
(function () {
  // Block requests to private/loopback/link-local addresses.
  // Applied to BOTH the hostname AND the DNS-resolved IP to defeat DNS rebinding
  // (attacker hostname passes hostname check, then DNS re-resolves to 192.168.x.x).
  var PRIVATE_IP_RE = /^(127\\.\\d+\\.\\d+\\.\\d+|10\\.\\d+\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|169\\.254\\.\\d+\\.\\d+|::1|0\\.0\\.0\\.0)$/i;
  var PRIVATE_HOST_RE = /^(localhost|127\\.\\d+\\.\\d+\\.\\d+|10\\.\\d+\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|169\\.254\\.\\d+\\.\\d+|\\[?::1\\]?|0\\.0\\.0\\.0)$/i;

  // 4 MiB hard cap on response bodies — prevents a slow/large remote response
  // from accumulating unbounded memory (string concat in the data event loop).
  var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

  function _safeHttpRequest(method, url, headers, body, callback) {
    console.log('[phonix.' + method + '] ' + url);
    var urlObj;
    try { urlObj = new URL(url); } catch (e) {
      console.error('[phonix.http] Invalid URL:', url);
      callback('{}');
      return;
    }
    if (urlObj.protocol !== 'https:') {
      console.error('[phonix.http] Blocked non-HTTPS request:', url);
      callback('{}');
      return;
    }
    if (PRIVATE_HOST_RE.test(urlObj.hostname)) {
      console.error('[phonix.http] Blocked request to private/internal host:', urlObj.hostname);
      callback('{}');
      return;
    }
    // Resolve hostname to IP first, then re-check against the IP blocklist.
    // This defeats DNS rebinding: a public hostname that passes the regex check
    // above but whose DNS record points to a private IP is caught here before
    // any TCP connection is opened.
    import('node:dns/promises').then(function (dns) {
      return dns.lookup(urlObj.hostname);
    }).then(function (resolved) {
      if (PRIVATE_IP_RE.test(resolved.address)) {
        console.error('[phonix.http] Blocked: ' + urlObj.hostname + ' resolves to private IP ' + resolved.address);
        callback('{}');
        return;
      }
      return import('node:https').then(function (mod) {
        var https = mod.default || mod;
        // Use the resolved IP as hostname and set the Host header manually so
        // TLS SNI and virtual-host routing still work correctly.
        var reqOpts = {
          hostname: resolved.address,
          path: urlObj.pathname + urlObj.search,
          method: method.toUpperCase(),
          headers: Object.assign(
            { 'User-Agent': 'phonix-run-local/0.1', 'Host': urlObj.hostname },
            headers || {}
          ),
        };
        if (body) {
          reqOpts.headers['Content-Length'] = Buffer.byteLength(body).toString();
        }
        var data = '';
        var bytesReceived = 0;
        var aborted = false;
        var req = https.request(reqOpts, function (res) {
          res.on('data', function (chunk) {
            if (aborted) return;
            bytesReceived += chunk.length;
            if (bytesReceived > MAX_RESPONSE_BYTES) {
              aborted = true;
              req.destroy();
              console.error('[phonix.http] Response exceeded ' + MAX_RESPONSE_BYTES + ' bytes — aborted.');
              callback('{}');
              return;
            }
            data += chunk;
          });
          res.on('end', function () {
            if (!aborted) callback(data);
          });
        });
        req.on('error', function (err) {
          if (!aborted) {
            console.error('[phonix.http] Error:', err.message);
            callback('{}');
          }
        });
        if (body) req.write(body);
        req.end();
      });
    }).catch(function (err) {
      console.error('[phonix.http] DNS resolution failed for ' + urlObj.hostname + ':', err.message);
      callback('{}');
    });
  }

  var _ph = {
    providerName: 'mock',
    http: {
      GET: function (url, headers, callback) {
        _safeHttpRequest('GET', url, headers, null, callback);
      },
      POST: function (url, headers, body, callback) {
        _safeHttpRequest('POST', url, headers, body, callback);
      },
    },
    ws: {
      open: function (url, opts, onOpen, onMessage, onError) {
        console.log('[phonix.ws] Connecting to', url);
        setTimeout(function () {
          console.log('[phonix.ws] Connected (mock)');
          if (typeof onOpen === 'function') onOpen();
          // Deliver a default test message after 500ms
          setTimeout(function () {
            var testPayload = JSON.stringify({
              prompt: 'Hello from local test',
              requestId: 'test-001',
              model: 'default',
            });
            console.log('[phonix.ws] Incoming message:', testPayload);
            if (typeof onMessage === 'function') onMessage(testPayload);
          }, 500);
        }, 100);
      },
      send: function (payload) {
        console.log('[phonix.ws] Outgoing:', payload);
      },
      close: function () {
        console.log('[phonix.ws] Closed');
      },
    },
    fulfill: function (result, contentType, destinations, onSuccess, onError) {
      console.log('[phonix.fulfill] Result:', result);
      console.log('[phonix.fulfill] Content-Type:', contentType);
      if (typeof onSuccess === 'function') onSuccess();
    },
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.phonix = _ph;
    // Backward compatibility: expose as _STD_ for templates that still use it
    globalThis._STD_ = {
      ws: _ph.ws,
      http: _ph.http,
      fulfill: _ph.fulfill,
    };
  }
})();
// ─────────────────────────────────────────────────────────────────────────────
`;
}
