export type RuntimeEnv = Record<string, unknown>;

export function getEnv(key: string, runtimeEnv?: RuntimeEnv): string {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === 'string') return runtimeValue;

  if (typeof process !== 'undefined') {
    const processValue = process.env?.[key];
    if (processValue) return processValue;
  }

  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  const viteValue = viteEnv?.[key];
  return viteValue || '';
}

export function jsonResponse(
  data: unknown,
  status = 200,
  options?: { cacheControl?: string }
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
  if (options?.cacheControl) {
    headers['Cache-Control'] = options.cacheControl;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function timingSafeEqual(a: string, b: string): boolean {
  // EdgeOne Edge Functions only expose Web APIs, so avoid Node's crypto/Buffer.
  // Tokens are capped before encoding to keep attacker-controlled work bounded.
  const maxChars = 512;
  if (a.length > maxChars || b.length > maxChars) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a.slice(0, maxChars));
  const bBytes = encoder.encode(b.slice(0, maxChars));
  const maxLength = Math.max(aBytes.length, bBytes.length);
  let mismatch = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }

  return mismatch === 0;
}

export function createAuthChecker(getSecretToken: () => string) {
  return function checkToken(request: Request): boolean {
    const secretToken = getSecretToken();

    try {
      const url = new URL(request.url);
      const urlToken = url.searchParams.get('token');
      if (urlToken) {
        if (!secretToken) return false;
        return timingSafeEqual(urlToken, secretToken);
      }
    } catch {
    }

    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      if (!secretToken) return false;
      const token = authHeader.substring(7);
      return timingSafeEqual(token, secretToken);
    }

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const requestOrigin = origin || referer;

    if (requestOrigin) {
      try {
        const requestUrl = new URL(requestOrigin);
        const currentUrl = new URL(request.url);
        const isLocalhost = requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
        const isSameHost =
          requestUrl.hostname === currentUrl.hostname ||
          (isLocalhost &&
            typeof process !== 'undefined' &&
            process.env?.NODE_ENV === 'development');
        if (isSameHost) return true;
      } catch {
      }
    }

    if (!secretToken) {
      console.warn('API_SECRET_TOKEN is not configured. Access denied for safety.');
    }
    return false;
  };
}

export function sanitizeErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : 'Unknown error';
  message = message.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]');
  message = message.replace(/https?:\/\/[^\s]+/g, '[API_ENDPOINT]');
  if (message.length > 100) {
    message = message.substring(0, 100) + '...';
  }
  return message;
}
