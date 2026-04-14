/**
 * Shared security utilities for the Axon SDK.
 *
 * SSRF prevention: validates URLs before any outbound HTTP request to a
 * user-supplied address, blocking private/loopback/link-local ranges including
 * the AWS EC2 IMDS (169.254.169.254), Azure IMDS (169.254.169.254), and
 * GCP metadata server (metadata.google.internal / 169.254.169.254).
 */

import { AxonError } from '../types.js';
import dns from 'node:dns/promises';

/**
 * Matches private/loopback/link-local IP prefixes inside a URL string.
 *
 * Blocked ranges:
 *   localhost         — loopback hostname
 *   127.x.x.x        — IPv4 loopback
 *   10.x.x.x         — RFC-1918 class A
 *   172.16-31.x.x    — RFC-1918 class B
 *   192.168.x.x      — RFC-1918 class C
 *   169.254.x.x      — link-local / AWS EC2 IMDS / Azure IMDS / GCP metadata
 *   0.0.0.0          — unspecified
 *   ::1 / [::1]      — IPv6 loopback
 *   [fe80...]        — IPv6 link-local
 */
const PRIVATE_IP_RE =
  /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|\[::1\]|\[fe80)/;

/** Matches raw IPv4 private ranges (used after DNS resolution). */
const PRIVATE_IPV4_RE =
  /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0)/;

/**
 * Assert that a URL is safe to contact.
 *
 * Enforces:
 * 1. HTTPS only — rejects http://.
 * 2. No private/loopback/link-local address in the URL itself.
 * 3. DNS rebinding defence — resolves the hostname and re-validates the IP
 *    (best-effort; DNS failures never block legitimate requests).
 *
 * @param url      The URL string to validate.
 * @param provider Human-readable provider name for error messages.
 * @param label    Human-readable label for the URL (e.g. "IPFS endpoint").
 * @throws {AxonError} if the URL fails any safety check.
 */
export async function assertSafeUrl(
  url: string,
  provider: string,
  label = 'URL',
): Promise<void> {
  if (!url.startsWith('https://')) {
    throw new AxonError(provider, `${label} must use HTTPS.`);
  }

  if (PRIVATE_IP_RE.test(url)) {
    throw new AxonError(provider, `${label} must not point to a private/local address.`);
  }

  // DNS rebinding defence — resolve hostname, re-validate resolved IP
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    // Skip resolution for bare IP literals — already checked above
    if (host && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')) {
      const results = await dns.resolve4(host).catch(() => [] as string[]);
      for (const ip of results) {
        if (PRIVATE_IPV4_RE.test(ip)) {
          throw new AxonError(
            provider,
            `${label} hostname '${host}' resolves to a private/local address (${ip}).`,
          );
        }
      }
    }
  } catch (err) {
    if (err instanceof AxonError) throw err;
    // DNS errors are silently ignored — never block on transient resolution failure
  }
}

/**
 * Synchronous SSRF check for use in contexts where async is not available.
 * Only validates the URL string itself — does not perform DNS resolution.
 */
export function assertSafeUrlSync(url: string, provider: string, label = 'URL'): void {
  if (!url.startsWith('https://')) {
    throw new AxonError(provider, `${label} must use HTTPS.`);
  }
  if (PRIVATE_IP_RE.test(url)) {
    throw new AxonError(provider, `${label} must not point to a private/local address.`);
  }
}
