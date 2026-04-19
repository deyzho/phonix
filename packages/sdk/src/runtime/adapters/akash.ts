/**
 * Akash runtime bootstrap.
 *
 * Akash containers run as standard Docker containers with Node.js. The phonix
 * runtime on Akash maps the provider-agnostic `phonix` API to:
 *
 *  - phonix.ws.open()   → starts an HTTP server on PORT (default 3000).
 *                         Messages arrive as POST /message; results are sent
 *                         back in the synchronous HTTP response.
 *  - phonix.ws.send()   → resolves the pending HTTP response with the payload.
 *  - phonix.http.GET/POST → Node.js global fetch (Node 18+).
 *  - phonix.fulfill()   → writes the result to stdout and resolves the response.
 *
 * The AkashMessagingClient (client-side SDK) communicates with deployed
 * containers by POSTing to their lease endpoint: POST /message.
 */
export function akashRuntimeBootstrap(): string {
  return `
// ─── AxonSDK Runtime (Akash adapter) ─────────────────────────────────────────
(function () {
  var _messageHandler = null;
  var _pendingRespond = null;
  var _server = null;
  var PORT = (typeof process !== 'undefined' && process.env && process.env.PORT)
    ? parseInt(process.env.PORT, 10)
    : 3000;

  // Incoming request handler — called by Node.js HTTP server
  function _handleRequest(req, res) {
    // Health check — Akash providers poll /health to confirm container is live
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && req.url === '/message') {
      var body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', function () {
        // Register the responder for this request so phonix.ws.send() can reply
        _pendingRespond = function (payload) {
          var out = typeof payload === 'string' ? payload : JSON.stringify(payload);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Phonix-Provider': 'akash',
          });
          res.end(out);
          _pendingRespond = null;
        };

        if (typeof _messageHandler === 'function') {
          try {
            _messageHandler(body);
          } catch (err) {
            // Ensure the HTTP response is always closed even on handler error
            if (_pendingRespond) {
              _pendingRespond(JSON.stringify({ error: String(err && err.message || err) }));
            }
          }
        } else {
          // No handler registered yet — return empty 204
          res.writeHead(204);
          res.end();
          _pendingRespond = null;
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  var _ph = {
    providerName: 'akash',

    http: {
      GET: function (url, headers, callback) {
        fetch(url, { method: 'GET', headers: headers || {} })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:akash] HTTP GET error:', err && err.message);
            callback('{}');
          });
      },
      POST: function (url, headers, body, callback) {
        fetch(url, { method: 'POST', headers: headers || {}, body: body })
          .then(function (r) { return r.text(); })
          .then(function (text) { callback(text); })
          .catch(function (err) {
            console.error('[phonix:akash] HTTP POST error:', err && err.message);
            callback('{}');
          });
      },
    },

    ws: {
      // In Akash, "open" starts the HTTP server that receives messages
      open: function (url, opts, onOpen, onMessage, onError) {
        _messageHandler = onMessage;

        import('node:http').then(function (mod) {
          var http = mod.default || mod;
          _server = http.createServer(_handleRequest);
          _server.listen(PORT, function () {
            console.log('[phonix:akash] Listening on port ' + PORT);
            if (typeof onOpen === 'function') onOpen();
          });
          _server.on('error', function (err) {
            console.error('[phonix:akash] Server error:', err && err.message);
            if (typeof onError === 'function') onError(err);
          });
        }).catch(function (err) {
          console.error('[phonix:akash] Failed to start HTTP server:', err && err.message);
          if (typeof onError === 'function') onError(err);
        });
      },
      // "send" resolves the pending HTTP response for the current message
      send: function (payload) {
        if (typeof _pendingRespond === 'function') {
          _pendingRespond(payload);
        } else {
          console.warn('[phonix:akash] ws.send() called with no pending request to respond to.');
        }
      },
      close: function () {
        if (_server) {
          _server.close();
          _server = null;
        }
        _messageHandler = null;
      },
    },

    fulfill: function (result, contentType, destinations, onSuccess, onError) {
      console.log('[phonix:akash] fulfill:', result);
      if (typeof _pendingRespond === 'function') {
        _pendingRespond(result);
      }
      if (typeof onSuccess === 'function') onSuccess();
    },
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.phonix = _ph;
  }
})();
// ─────────────────────────────────────────────────────────────────────────────
`;
}
