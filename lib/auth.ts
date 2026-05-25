import crypto from 'crypto';
import type { User } from '@/types/user';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development_only_change_in_production';
const JWT_EXPIRES_IN = 60 * 60; // 1 hour in seconds

// Base64URL encoding without padding
function base64urlEncode(str: string): string {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Base64URL decoding
function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString();
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  exp: number;
  iat: number;
}

export function generateToken(user: Omit<User, 'passwordHash'>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN,
    iat: Math.floor(Date.now() / 1000),
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64');

  const encodedSignature = base64urlEncode(signature.toString());

  return encodedHeader + '.' + encodedPayload + '.' + encodedSignature;
}

export function verifyToken(token: string): { payload: JwtPayload | null; error: string | null } {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return { payload: null, error: 'Invalid token format' };
    }

    const signature = crypto.createHmac('sha256', JWT_SECRET)
      .update(encodedHeader + '.' + encodedPayload)
      .digest('base64');

    const expectedSignature = base64urlEncode(signature.toString());

    if (encodedSignature !== expectedSignature) {
      return { payload: null, error: 'Invalid token signature' };
    }

    const payload = JSON.parse(base64urlDecode(encodedPayload)) as JwtPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { payload: null, error: 'Token expired' };
    }

    return { payload, error: null };
  } catch (err) {
    return { payload: null, error: 'Invalid token' };
  }
}

export async function hashPassword(password: string): Promise<string> {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hashed: string): boolean {
  return crypto.createHash('sha256').update(password).digest('hex') === hashed;
}

export function authenticateHandler(handler: (request: Request, userId: string) => Promise<Response>) {
  return async (request: Request) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const { payload, error } = verifyToken(token);

    if (error || !payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return handler(request, payload.userId);
  };
}

export function authorizeRole(allowedRoles: string[]) {
  return function (handler: (request: Request, userId: string, role: string) => Promise<Response>) {
    return authenticateHandler(async (request, userId) => {
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.substring(7);
      const { payload } = verifyToken(token);
      if (!payload) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!allowedRoles.includes(payload.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return handler(request, payload.userId, payload.role);
    });
  };
}
