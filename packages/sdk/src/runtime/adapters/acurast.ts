/**
 * Acurast runtime bootstrap.
 *
 * Returns a JavaScript string that is prepended to the deployment bundle.
 * It maps `globalThis.phonix` to the Acurast TEE's `_STD_` global,
 * providing a provider-agnostic interface to templates.
 *
 * Also keeps `_STD_` itself intact for backward compatibility with templates
 * that still reference it directly.
 */
export function acurastRuntimeBootstrap(): string {
  return `
// ─── AxonSDK Runtime (Acurast adapter) ───────────────────────────────────────
(function () {
  var _ph = {
    providerName: 'acurast',
    http: {
      GET: function (url, headers, callback) {
        _STD_.http.GET(url, headers, callback);
      },
      POST: function (url, headers, body, callback) {
        _STD_.http.POST(url, headers, body, callback);
      },
    },
    ws: {
      open: function (url, opts, onOpen, onMessage, onError) {
        _STD_.ws.open(url, opts, onOpen, onMessage, onError);
      },
      send: function (payload) {
        _STD_.ws.send(payload);
      },
      close: function () {
        _STD_.ws.close();
      },
    },
    fulfill: function (result, contentType, destinations, onSuccess, onError) {
      _STD_.fulfill(result, contentType, destinations, onSuccess, onError);
    },
  };
  if (typeof globalThis !== 'undefined') globalThis.phonix = _ph;
})();
// ─────────────────────────────────────────────────────────────────────────────
`;
}
