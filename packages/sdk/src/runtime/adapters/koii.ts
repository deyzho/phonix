/**
 * Koii runtime bootstrap.
 *
 * Returns a JavaScript string prepended to bundles deployed to Koii.
 * Koii tasks run in a Node.js environment with `namespaceWrapper` available
 * globally. This adapter maps `phonix` to that environment.
 *
 * Messaging model:
 *   - ws.open() registers a message handler; messages arrive via the
 *     KoiiProvider calling the task's exported `handleMessage` function.
 *   - ws.send() stores the response in `globalThis.__phonixResult`, which
 *     KoiiProvider reads after calling the task entry.
 *   - http.GET/POST use Node.js fetch (available in Node 18+).
 */
export function koiiRuntimeBootstrap(): string {
  return `
// ─── AxonSDK Runtime (Koii adapter) ──────────────────────────────────────────
(function () {
  var _messageHandler = null;

  var _ph = {
    providerName: 'koii',
    http: {
      GET: function (url, headers, callback) {
        fetch(url, { method: 'GET', headers: headers || {} })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:koii] HTTP GET error:', err && err.message);
            callback('{}');
          });
      },
      POST: function (url, headers, body, callback) {
        fetch(url, { method: 'POST', headers: headers || {}, body: body })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:koii] HTTP POST error:', err && err.message);
            callback('{}');
          });
      },
    },
    ws: {
      // Koii tasks are invoked per-round; onOpen fires immediately.
      // Messages are delivered via __phonixDispatch (called by KoiiProvider).
      open: function (url, opts, onOpen, onMessage, onError) {
        _messageHandler = onMessage;
        if (typeof globalThis !== 'undefined') {
          globalThis.__phonixMessageHandler = onMessage;
        }
        if (typeof onOpen === 'function') {
          setTimeout(onOpen, 0);
        }
      },
      send: function (payload) {
        if (typeof globalThis !== 'undefined') {
          globalThis.__phonixResult = payload;
        }
      },
      close: function () {
        _messageHandler = null;
      },
    },
    fulfill: function (result, contentType, destinations, onSuccess, onError) {
      if (typeof globalThis !== 'undefined') {
        globalThis.__phonixResult = result;
      }
      if (typeof onSuccess === 'function') onSuccess();
    },
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.phonix = _ph;
    globalThis.__phonixDispatch = function (payload) {
      if (_messageHandler) _messageHandler(payload);
    };
  }
})();
// ─────────────────────────────────────────────────────────────────────────────
`;
}
