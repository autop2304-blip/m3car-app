import crypto from 'node:crypto';

const DRIVER_SESSION_COOKIE = 'm3car_driver_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_ADMIN_CODE_SHA256 =
  'd4d42c5627a574376ec555c54a7a9e3804deb8376c9c59b9455dacb680bc10a7';

const PLACEHOLDER_ENV_VALUES = new Set([
  'ADMIN_ACCESS_CODE',
  'MY_ADMIN_ACCESS_CODE',
  'YOUR_ADMIN_ACCESS_CODE',
  'ADMIN_SESSION_SECRET',
  'MY_ADMIN_SESSION_SECRET',
  'CHANGE_ME',
]);

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

interface AdminSessionPayload {
  role: 'admin';
  name: string;
  jti: string;
  iat: number;
  exp: number;
}

interface DriverSessionPayload {
  role: 'driver';
  driverId: string;
  phone: string;
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

function hashPasswordScrypt(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPasswordScrypt(secret: string, storedHash: string): boolean {
  if (!secret || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derivedHex = crypto
      .scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1 })
      .toString('hex');
    return safeEqualHex(derivedHex, expectedHex);
  } catch {
    return false;
  }
}

function normalizePhoneServer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

function normalizePlateServer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeNameServer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function validatePasswordPolicy(password: unknown, confirmPassword: unknown): string | null {
  if (typeof password !== 'string' || password.length < 6) {
    return 'Kata sandi pribadi minimal 6 karakter.';
  }
  if (password.length > 128 || password.includes('\0')) {
    return 'Format kata sandi tidak valid.';
  }
  if (!password.trim()) {
    return 'Kata sandi tidak boleh hanya berisi spasi.';
  }
  if (password !== confirmPassword) {
    return 'Konfirmasi kata sandi tidak cocok. Ulangi kata sandi yang sama.';
  }
  return null;
}

function signDriverSessionToken(driverId: string, phone: string, name: string) {
  const now = Date.now();
  const payload: DriverSessionPayload = {
    role: 'driver',
    driverId,
    phone,
    name,
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

function verifyTokenGeneric<T extends { role: string; exp: number }>(
  token: string | undefined,
  expectedRole: 'admin' | 'driver'
): T | null {
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
    ) as T;
    if (decoded.role !== expectedRole) return null;
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

function extractToken(headers: Record<string, string | undefined>, cookieName: string): string | undefined {
  const authHeader = getHeaderCaseInsensitive(headers, 'authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(getHeaderCaseInsensitive(headers, 'cookie'));
  return cookies[cookieName];
}

function buildCookieHeader(
  headers: Record<string, string | undefined>,
  token: string,
  maxAgeSeconds: number
): string {
  const proto = getHeaderCaseInsensitive(headers, 'x-forwarded-proto') || 'https';
  const isHttps = proto.includes('https');
  const attrs = [
    `${DRIVER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) attrs.push('Secure');
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

  // POST /api/driver/hash-password
  if (method === 'POST' && action === 'hash-password') {
    const body = parseJsonBody(event);
    const errMsg = validatePasswordPolicy(body.password, body.confirmPassword);
    if (errMsg) {
      return jsonResponse(400, { ok: false, message: errMsg });
    }
    const passwordHash = hashPasswordScrypt(String(body.password));
    return jsonResponse(200, {
      ok: true,
      passwordHash,
      hasPassword: true,
      passwordUpdatedAt: new Date().toISOString(),
    });
  }

  // POST /api/driver/verify-password
  if (method === 'POST' && action === 'verify-password') {
    const body = parseJsonBody(event);
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordHash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
    const driverId = typeof body.driverId === 'string' ? body.driverId : '';
    const phone = normalizePhoneServer(body.phone);
    const name = typeof body.name === 'string' ? body.name : 'Driver M3CAR';
    const status = String(body.status || '').toUpperCase().trim();

    if (!password || !passwordHash) {
      return jsonResponse(400, { ok: false, message: 'Nomor HP dan kata sandi wajib diisi.' });
    }

    if (!verifyPasswordScrypt(password, passwordHash)) {
      return jsonResponse(401, {
        ok: false,
        verified: false,
        message: 'Kata sandi salah. Periksa kembali kata sandi Anda atau gunakan Lupa Kata Sandi.',
      });
    }

    if (status === 'MENUNGGU' || status === 'WAITING_APPROVAL' || status === 'PENDING') {
      return jsonResponse(403, {
        ok: false,
        verified: true,
        pendingApproval: true,
        message:
          'Akun Anda masih berstatus MENUNGGU PERSETUJUAN ADMIN. Login dibuka setelah Admin menyetujui pendaftaran Anda.',
      });
    }

    if (status === 'DIBLOKIR' || status === 'BLOCKED') {
      return jsonResponse(403, {
        ok: false,
        verified: true,
        blocked: true,
        message: 'Akun Driver Anda sedang DIBLOKIR oleh Admin. Hubungi Admin Pusat M3CAR.',
      });
    }

    const { token, payload } = signDriverSessionToken(driverId, phone, name);
    const setCookie = buildCookieHeader(event.headers, token, Math.floor(SESSION_TTL_MS / 1000));
    return jsonResponse(
      200,
      {
        ok: true,
        verified: true,
        rejected: status === 'DITOLAK' || status === 'REJECTED',
        token,
        expiresAt: payload.exp,
        user: {
          id: driverId,
          phone,
          name,
          role: 'driver',
        },
      },
      { 'Set-Cookie': setCookie }
    );
  }

  // POST /api/driver/first-password
  if (method === 'POST' && action === 'first-password') {
    const body = parseJsonBody(event);
    if (Boolean(body.hasExistingPassword)) {
      return jsonResponse(409, {
        ok: false,
        message: 'Akun driver ini sudah memiliki kata sandi. Silakan masuk atau gunakan Lupa Kata Sandi.',
      });
    }

    const phone = normalizePhoneServer(body.phone);
    const storedPhone = normalizePhoneServer(body.storedPhone);
    const plate = normalizePlateServer(body.plateNumber);
    const storedPlate = normalizePlateServer(body.storedPlate);

    if (!phone || !storedPhone || phone !== storedPhone) {
      return jsonResponse(400, { ok: false, message: 'Nomor HP tidak sesuai dengan data driver.' });
    }

    if (storedPlate) {
      if (!plate || plate !== storedPlate) {
        return jsonResponse(401, {
          ok: false,
          message: 'Nomor Polisi (Plat Kendaraan) tidak cocok dengan data driver lama.',
        });
      }
    } else {
      const fullName = normalizeNameServer(body.fullName);
      const storedName = normalizeNameServer(body.storedName);
      if (!fullName || !storedName || fullName !== storedName) {
        return jsonResponse(401, {
          ok: false,
          message: 'Nama Lengkap tidak cocok dengan data driver lama.',
        });
      }
    }

    const errMsg = validatePasswordPolicy(body.password, body.confirmPassword);
    if (errMsg) {
      return jsonResponse(400, { ok: false, message: errMsg });
    }

    const passwordHash = hashPasswordScrypt(String(body.password));
    return jsonResponse(200, {
      ok: true,
      passwordHash,
      hasPassword: true,
      passwordUpdatedAt: new Date().toISOString(),
    });
  }

  // POST /api/driver/recover-password
  if (method === 'POST' && action === 'recover-password') {
    const body = parseJsonBody(event);
    const phone = normalizePhoneServer(body.phone);
    const storedPhone = normalizePhoneServer(body.storedPhone);
    if (!phone || !storedPhone || phone !== storedPhone) {
      return jsonResponse(400, { ok: false, message: 'Nomor HP driver tidak ditemukan.' });
    }

    const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : '';
    const storedRecoveryCodeHash =
      typeof body.storedRecoveryCodeHash === 'string' ? body.storedRecoveryCodeHash : '';
    const storedRecoveryExpiresAt =
      typeof body.storedRecoveryExpiresAt === 'string' ? body.storedRecoveryExpiresAt : '';

    let verifiedIdentity = false;

    if (recoveryCode && storedRecoveryCodeHash) {
      const notExpired =
        !storedRecoveryExpiresAt || Date.parse(storedRecoveryExpiresAt) > Date.now();
      if (notExpired && verifyPasswordScrypt(recoveryCode, storedRecoveryCodeHash)) {
        verifiedIdentity = true;
      } else {
        return jsonResponse(401, {
          ok: false,
          message: 'Kode Pemulihan dari Admin tidak valid atau sudah kedaluwarsa.',
        });
      }
    } else {
      const plate = normalizePlateServer(body.plateNumber);
      const storedPlate = normalizePlateServer(body.storedPlate);
      const fullName = normalizeNameServer(body.fullName);
      const storedName = normalizeNameServer(body.storedName);

      if (plate && storedPlate && plate === storedPlate && fullName && storedName && fullName === storedName) {
        verifiedIdentity = true;
      }
    }

    if (!verifiedIdentity) {
      return jsonResponse(401, {
        ok: false,
        message:
          'Verifikasi pemulihan gagal. Pastikan Nomor Polisi dan Nama Lengkap sesuai pendaftaran, atau masukkan Kode Pemulihan dari Admin.',
      });
    }

    const errMsg = validatePasswordPolicy(body.newPassword, body.confirmPassword);
    if (errMsg) {
      return jsonResponse(400, { ok: false, message: errMsg });
    }

    const passwordHash = hashPasswordScrypt(String(body.newPassword));
    return jsonResponse(200, {
      ok: true,
      passwordHash,
      hasPassword: true,
      clearRecovery: true,
      passwordUpdatedAt: new Date().toISOString(),
    });
  }

  // POST /api/driver/generate-recovery-code (Admin protected)
  if (method === 'POST' && action === 'generate-recovery-code') {
    const adminToken = extractToken(event.headers, 'm3car_admin_session');
    const adminPayload = verifyTokenGeneric<AdminSessionPayload>(adminToken, 'admin');
    if (!adminPayload) {
      return jsonResponse(401, {
        ok: false,
        message: 'Sesi Admin tidak valid. Hanya Admin yang dapat membuat kode pemulihan.',
      });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const recoveryCodeHash = hashPasswordScrypt(code);
    const recoveryCodeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return jsonResponse(200, {
      ok: true,
      recoveryCode: code,
      recoveryCodeHash,
      recoveryCodeExpiresAt,
    });
  }

  // GET /api/driver/session
  if (method === 'GET' && action === 'session') {
    const token = extractToken(event.headers, DRIVER_SESSION_COOKIE);
    const payload = verifyTokenGeneric<DriverSessionPayload>(token, 'driver');
    if (!payload) {
      return jsonResponse(401, { ok: false, authenticated: false });
    }
    return jsonResponse(200, {
      ok: true,
      authenticated: true,
      user: {
        id: payload.driverId,
        phone: payload.phone,
        name: payload.name,
        role: 'driver',
      },
    });
  }

  // POST /api/driver/logout
  if (method === 'POST' && action === 'logout') {
    const clearCookie = buildCookieHeader(event.headers, '', 0);
    return jsonResponse(200, { ok: true }, { 'Set-Cookie': clearCookie });
  }

  return jsonResponse(404, { ok: false, message: 'Endpoint driver tidak ditemukan.' });
}
