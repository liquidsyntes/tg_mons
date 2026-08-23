import { NextRequest, NextResponse } from 'next/server';

/**
 * Verifies that the request has a valid Bearer token matching COLLECT_API_TOKEN.
 * Returns { authorized: true } if valid, or { authorized: false, response } if not.
 */
export function verifyBearerToken(req: NextRequest): { authorized: true } | { authorized: false; response: NextResponse } {
  const configuredToken = process.env.COLLECT_API_TOKEN;

  // If no token is configured, deny all mutating requests
  if (!configuredToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized: COLLECT_API_TOKEN не задан на сервере' },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized: требуется Bearer токен' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (token !== configuredToken) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden: неверный Bearer токен' },
        { status: 403 }
      ),
    };
  }

  return { authorized: true };
}
