/**
 * Fluence runtime bootstrap.
 *
 * Returns a JavaScript string prepended to bundles deployed to Fluence.
 * Fluence spells run in a JS environment with access to `fetch` and a
 * particle-based messaging context. This adapter maps `phonix` to that
 * environment.
 *
 * Messaging model:
 *   - ws.open() registers an incoming message handler; in Fluence, messages
 *     arrive via particle calls routed by the Aqua scheduler.
 *   - ws.send() stores the outgoing payload so the Aqua caller can read it
 *     as the function's return value via `globalThis.__phonixResult`.
 *   - The FluenceProvider's send() method calls the deployed spell function
 *     and reads `__phonixResult` from the return context.
 */
export function fluenceRuntimeBootstrap(): string {
  return `
// ─── AxonSDK Runtime (Fluence adapter) ───────────────────────────────────────
(function () {
  var _messageHandler = null;

  var _ph = {
    providerName: 'fluence',
    http: {
      GET: function (url, headers, callback) {
        // Fluence spell context provides fetch (Node.js-based)
        fetch(url, { method: 'GET', headers: headers || {} })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:fluence] HTTP GET error:', err && err.message);
            callback('{}');
          });
      },
      POST: function (url, headers, body, callback) {
        fetch(url, { method: 'POST', headers: headers || {}, body: body })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:fluence] HTTP POST error:', err && err.message);
            callback('{}');
          });
      },
    },
    ws: {
      // In Fluence, "connection" is implicit — spells are invoked by the scheduler.
      // onOpen fires immediately; onMessage is stored for the Aqua call handler.
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
        // Store result for the Fluence caller to retrieve
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
    // Provide __phonixDispatch so the Fluence caller can deliver a message
    globalThis.__phonixDispatch = function (payload) {
      if (_messageHandler) _messageHandler(payload);
    };
  }
})();
// ─────────────────────────────────────────────────────────────────────────────
`;
}
