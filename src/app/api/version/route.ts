import { NextResponse } from 'next/server';
import { getAppVersion } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ version: getAppVersion() }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
