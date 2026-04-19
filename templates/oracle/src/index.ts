/**
 * AxonSDK Oracle Template — Data Oracle on Acurast
 *
 * This script runs ON the phone inside the Trusted Execution Environment (TEE).
 * It fetches external data, signs it with the processor keypair, and pushes
 * the signed result to a destination address or WebSocket.
 *
 * Example: Bitcoin price feed from CoinGecko
 *
 * How it works:
 *  1. The processor makes an HTTPS GET request to an external API
 *  2. The response is parsed and signed by the processor's TEE keypair
 *  3. The signed result is pushed to the configured destinations
 *
 * To deploy:
 *   axon deploy
 *
 * To test locally (with mock _STD_):
 *   axon run-local oracle
 */

// _STD_ is the Acurast TEE runtime global — available on-device, mocked locally
declare const _STD_: {
  http: {
    GET(
      url: string,
      headers: Record<string, string>,
      callback: (response: string) => void
    ): void;
  };
  fulfill(
    result: string,
    contentType: string,
    destinations: Record<string, unknown>,
    onSuccess: () => void,
    onError: (err: unknown) => void
  ): void;
  ws: {
    open(
      url: string,
      options: Record<string, unknown>,
      onOpen: () => void,
      onMessage: (payload: string) => void,
      onError: (err: unknown) => void
    ): void;
    send(payload: string): void;
  };
};

// ─── Configuration ────────────────────────────────────────────────────────────

/** The external data source to fetch from */
const PRICE_FEED_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

/** How many ms between refreshes when used in interval mode */
const REFRESH_INTERVAL_MS = 60_000; // 1 minute

// ─── Data types ───────────────────────────────────────────────────────────────

interface PriceFeedResponse {
  bitcoin?: { usd?: number };
  ethereum?: { usd?: number };
}

interface OracleResult {
  btcUsd: number | null;
  ethUsd: number | null;
  timestamp: number;
  source: string;
}

// ─── Oracle logic ─────────────────────────────────────────────────────────────

/**
 * Fetch the latest prices and push the signed result to destinations.
 */
function fetchAndFulfill(): void {
  print('[phonix:oracle] Fetching prices from CoinGecko...');

  _STD_.http.GET(
    PRICE_FEED_URL,
    {
      Accept: 'application/json',
    },
    (response: string) => {
      print('[phonix:oracle] Got response: ' + response.slice(0, 200));

      let data: PriceFeedResponse;
      try {
        data = JSON.parse(response) as PriceFeedResponse;
      } catch {
        print('[phonix:oracle] Error: response is not valid JSON');
        return;
      }

      const result: OracleResult = {
        btcUsd: data.bitcoin?.usd ?? null,
        ethUsd: data.ethereum?.usd ?? null,
        timestamp: Date.now(),
        source: 'coingecko',
      };

      print(
        `[phonix:oracle] BTC: $${result.btcUsd ?? 'N/A'} | ETH: $${result.ethUsd ?? 'N/A'}`
      );

      const resultString = JSON.stringify(result);

      // Push the signed result to the configured destinations
      // In production, destinations are set in axon.json
      _STD_.fulfill(
        resultString,
        'application/json',
        {
          // Destination config — filled in by Acurast based on axon.json destinations[]
        },
        () => {
          print('[phonix:oracle] Result fulfilled successfully');
        },
        (err: unknown) => {
          print('[phonix:oracle] Error fulfilling result: ' + JSON.stringify(err));
        }
      );
    }
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// Fetch immediately on start
fetchAndFulfill();

// Note: For interval deployments, Acurast will re-invoke this script
// according to the schedule defined in axon.json.
// You do NOT need to set up your own timer — the TEE runtime handles it.
print('[phonix:oracle] Oracle script initialised');
