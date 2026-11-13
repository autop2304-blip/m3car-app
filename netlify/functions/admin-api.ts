import crypto from 'node:crypto';

const ADMIN_SESSION_COOKIE = 'm3car_admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// SHA-256 digest of the default admin access code (used only if ADMIN_ACCESS_CODE is unset)
const DEFAULT_ADMIN_CODE_SHA256 =
  'd4d42c5627a574376ec555c54a7a9e3804deb8376c9c59b9455dacb680bc10a7';

interface NetlifyEvent {
  httpMethod: string;
  path: string;
  rawUrl?: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

interface SessionPayload {
  role: 'admin';
  name: string;
  jti: string;
  iat: number;
  exp: number;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeEnvSecret(raw: string | undefined): string {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

const PLACEHOLDER_ENV_VALUES = new Set([
  'ADMIN_ACCESS_CODE',
  'MY_ADMIN_ACCESS_CODE',
  'YOUR_ADMIN_ACCESS_CODE',
  'ADMIN_SESSION_SECRET',
  'MY_ADMIN_SESSION_SECRET',
  'CHANGE_ME',
]);

function getExpectedAdminHashHex(): string {
  const envCode = normalizeEnvSecret(process.env.ADMIN_ACCESS_CODE);
  if (envCode.length > 0 && !PLACEHOLDER_ENV_VALUES.has(envCode.toUpperCase())) {
    return sha256Hex(envCode);
  }
  return DEFAULT_ADMIN_CODE_SHA256;
}

function getSessionSecret(): string {
  const envSecret = normalizeEnvSecret(process.env.ADMIN_SESSION_SECRET);
  if (envSecret.length >= 16 && !PLACEHOLDER_ENV_VALUES.has(envSecret.toUpperCase())) {
    return envSecret;
  }
  return sha256Hex(`m3car-session-key:${getExpectedAdminHashHex()}`);
}

function safeEqualHex(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function signAdminSessionToken(): { token: string; payload: SessionPayload } {
  const now = Date.now();
  const payload: SessionPayload = {
    role: 'admin',
    name: 'Admin Pusat M3CAR',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return { token: `${encodedPayload}.${sig}`, payload };
}

function verifyAdminSessionToken(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (decoded.role !== 'admin') return null;
    if (typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getHeaderCaseInsensitive(
  headers: Record<string, string | undefined>,
  targetName: string
): string | undefined {
  const lowerTarget = targetName.toLowerCase();
  for (const [key, val] of Object.entries(headers || {})) {
    if (key.toLowerCase() === lowerTarget) {
      return val;
    }
  }
  return undefined;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) {
        try {
          out[k] = decodeURIComponent(v);
        } catch {
          out[k] = v;
        }
      }
    }
  }
  return out;
}

function extractToken(headers: Record<string, string | undefined>): string | undefined {
  const authHeader = getHeaderCaseInsensitive(headers, 'authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(getHeaderCaseInsensitive(headers, 'cookie'));
  return cookies[ADMIN_SESSION_COOKIE];
}

function buildCookieHeader(headers: Record<string, string | undefined>, token: string, maxAgeSeconds: number): string {
  const proto = getHeaderCaseInsensitive(headers, 'x-forwarded-proto') || 'https';
  const isHttps = proto.includes('https');
  const attrs = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): NetlifyResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

function parseJsonBody(event: NetlifyEvent): Record<string, unknown> {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function resolveAction(event: NetlifyEvent): string {
  const rawPath = (event.path || '').split('?')[0].replace(/\/+$/, '');
  const parts = rawPath.split('/').filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const action = resolveAction(event);

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    };
  }

  // POST /api/admin/login
  if (method === 'POST' && action === 'login') {
    const body = parseJsonBody(event);
    const rawCode = typeof body.code === 'string' ? body.code.trim() : '';
    if (!rawCode) {
      return jsonResponse(400, { ok: false, message: 'Kode Admin wajib diisi.' });
    }

    const inputHash = sha256Hex(rawCode);
    const expectedHash = getExpectedAdminHashHex();
    if (!safeEqualHex(inputHash, expectedHash)) {
      return jsonResponse(401, { ok: false, message: 'Kode Salah' });
    }

    const { token, payload } = signAdminSessionToken();
    const setCookie = buildCookieHeader(event.headers, token, Math.floor(SESSION_TTL_MS / 1000));
    return jsonResponse(
      200,
      {
        ok: true,
        authenticated: true,
        token,
        expiresAt: payload.exp,
        user: {
          id: 'admin-root',
          name: payload.name,
          role: 'admin',
        },
      },
      { 'Set-Cookie': setCookie }
    );
  }

  // GET /api/admin/session
  if (method === 'GET' && action === 'session') {
    const token = extractToken(event.headers);
    const payload = verifyAdminSessionToken(token);
    if (!payload) {
      return jsonResponse(401, {
        ok: false,
        authenticated: false,
        message: 'Sesi Admin tidak valid atau sudah berakhir.',
      });
    }
    return jsonResponse(200, {
      ok: true,
      authenticated: true,
      expiresAt: payload.exp,
      user: {
        id: 'admin-root',
        name: payload.name,
        role: 'admin',
      },
    });
  }

  // POST /api/admin/verify
  if (method === 'POST' && action === 'verify') {
    const token = extractToken(event.headers);
    const payload = verifyAdminSessionToken(token);
    if (!payload) {
      return jsonResponse(401, {
        ok: false,
        authenticated: false,
        message: 'Sesi Admin tidak valid atau sudah berakhir.',
      });
    }
    return jsonResponse(200, { ok: true, verified: true });
  }

  // POST /api/admin/logout
  if (method === 'POST' && action === 'logout') {
    const clearCookie = buildCookieHeader(event.headers, '', 0);
    return jsonResponse(200, { ok: true }, { 'Set-Cookie': clearCookie });
  }

  // POST /api/admin/change-code
  if (method === 'POST' && action === 'change-code') {
    const token = extractToken(event.headers);
    const payload = verifyAdminSessionToken(token);
    if (!payload) {
      return jsonResponse(401, {
        ok: false,
        authenticated: false,
        message: 'Sesi Admin tidak valid atau sudah berakhir.',
      });
    }
    return jsonResponse(400, {
      ok: false,
      message:
        'Di Netlify, ubah Environment Variable ADMIN_ACCESS_CODE di Site Settings lalu Redeploy agar perubahan bersifat permanen.',
    });
  }

  return jsonResponse(404, { ok: false, message: 'Endpoint admin tidak ditemukan.' });
}
