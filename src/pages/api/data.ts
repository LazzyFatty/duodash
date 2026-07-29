import type { APIRoute } from 'astro';
import type { CacheEntry, UserData } from '../../types';
import { transformDuolingoData } from '../../services/duolingoService';
import {
  getEnv,
  jsonResponse,
  createAuthChecker,
  sanitizeErrorMessage,
  type RuntimeEnv,
} from '../../utils/api-utils';
import { CACHE_TTL_MS } from '../../constants/config';
import { isFreshSameDayCache, resolveTimeZone } from '../../utils/dateUtils';

export const prerender = false;

const DUOLINGO_BASE_URL = 'https://www.duolingo.com';
const MAX_CACHE_SIZE = 100;
const DEFAULT_TIMEOUT = 8000;
const USER_PROFILE_FIELDS = [
  'id',
  'username',
  'name',
  'streak',
  'totalXp',
  'gemsTotalCount',
  'tier',
  'courses',
  'creationDate',
  'hasPlus',
  'dailyGoal',
  'learningLanguage',
  'streakData',
  'streakExtendedToday',
  'xpGains',
  'inventory',
  'trackingProperties',
  'has_item_premium_subscription',
  'has_item_immersive_subscription',
  'weeklyXp',
  'sessionCount',
  'streakFreezeCount',
].join(',');

const cache = new Map<string, CacheEntry<UserData>>();

function normalizeJwt(value: string): string {
  const trimmed = value.trim();
  const hasMatchingQuotes =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  return hasMatchingQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

function resolveUserIdFromJwt(jwt: string): string | null {
  try {
    const payloadPart = jwt.split('.')[1];
    if (!payloadPart) return null;

    const base64 = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64)) as { sub?: string | number };
    const userId = String(payload.sub ?? '');

    return /^\d+$/.test(userId) ? userId : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, headers: HeadersInit, timeoutMs = DEFAULT_TIMEOUT): Promise<{ data: unknown; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      return { data: null, status: res.status };
    }
    return { data: await res.json(), status: res.status };
  } catch {
    return { data: null, status: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleDataRequest(
  request: Request,
  runtimeEnv?: RuntimeEnv,
): Promise<Response> {
  const checkToken = createAuthChecker(() => getEnv('API_SECRET_TOKEN', runtimeEnv));
  if (!checkToken(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const requestedTimeZone = resolveTimeZone(request.headers.get('x-user-timezone') || undefined);
  const username = getEnv('DUOLINGO_USERNAME', runtimeEnv);
  const jwt = normalizeJwt(getEnv('DUOLINGO_JWT', runtimeEnv));

  if (!username || !jwt) {
    return jsonResponse({ error: 'Not configured' }, 400);
  }

  const userId = resolveUserIdFromJwt(jwt);
  if (!userId) {
    return jsonResponse({
      error: 'JWT Token 格式无效，请重新获取 Duolingo JWT Token',
      code: 'JWT_INVALID'
    }, 401);
  }

  const cacheKey = `user:${username}:tz:${requestedTimeZone}`;
  const cached = cache.get(cacheKey);

  // 检查缓存是否失效（过期或跨天）
  if (cached) {
    if (isFreshSameDayCache(cached.timestamp, CACHE_TTL_MS, Date.now(), requestedTimeZone)) {
      return jsonResponse({ data: cached.data, cached: true }, 200, { cacheControl: 'private, max-age=60' });
    }
  }

  try {
    const headers: HeadersInit = {
      'User-Agent': 'Duolingo/7.41.4 (Android; 10; SM-G960F)',
      'Accept': 'application/json',
      'Authorization': `Bearer ${jwt}`
    };

    // JWT 的 sub 就是 Duolingo userId。旧用户名查询接口会返回数 MB 的
    // 完整用户对象，在 Edge Runtime 中重复下载和解析容易超过资源限制。
    const profileUrl = new URL(`${DUOLINGO_BASE_URL}/2023-05-23/users/${userId}`);
    profileUrl.searchParams.set('fields', USER_PROFILE_FIELDS);

    // 1) 获取仪表盘需要的用户字段（含数学/音乐等非语言课程）
    const mainResult = await fetchWithTimeout(
      profileUrl.toString(),
      headers,
      10000
    );

    if (mainResult.status === 401 || mainResult.status === 403) {
      return jsonResponse({
        error: 'JWT Token 已过期或无效，请重新获取 Duolingo JWT Token',
        code: 'JWT_EXPIRED'
      }, 401);
    }

    const userData = mainResult.data as any;

    if (!userData) {
      return jsonResponse({ error: 'Failed to fetch user data' }, 500);
    }

    if (
      userData.username &&
      userData.username.toLowerCase() !== username.trim().toLowerCase()
    ) {
      return jsonResponse({
        error: 'DUOLINGO_USERNAME 与 JWT 所属账号不一致',
        code: 'USERNAME_MISMATCH'
      }, 400);
    }

    // 2) 获取 xp_summaries（获取完整历史数据）
    const xpResult = await fetchWithTimeout(
      `${DUOLINGO_BASE_URL}/2017-06-30/users/${userId}/xp_summaries?startDate=1970-01-01`,
      headers,
      12000
    );
    const xpData = xpResult.data as { summaries?: unknown[] } | null;
    if (xpData?.summaries) {
      userData._xpSummaries = xpData.summaries;
    }

    const transformed = transformDuolingoData(userData, requestedTimeZone);

    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(cacheKey, { data: transformed, timestamp: Date.now() });

    return jsonResponse({ data: transformed }, 200, { cacheControl: 'private, max-age=60' });
  } catch (error: unknown) {
    return jsonResponse({ error: sanitizeErrorMessage(error) }, 500);
  }
}

export const GET: APIRoute = ({ request }) => handleDataRequest(request);
