import { NextResponse } from 'next/server';

/**
 * Reports the version the *server* is currently running.
 *
 * Deliberately not under /api — nginx routes that prefix to the backend on
 * :4100, so a route handler there would never be reached.
 *
 * The client compares this against the version baked into its own bundle at
 * build time; a mismatch means a newer deploy is live.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // Reads APP_VERSION, not NEXT_PUBLIC_APP_VERSION: anything prefixed
  // NEXT_PUBLIC_ is substituted literally at build time, so a public var here
  // would report the version this bundle was built with — never the one the
  // server is actually running. The deploy sets both to the same value.
  return NextResponse.json(
    { version: process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || 'dev' },
    {
      headers: {
        // Must never be cached — not by the browser, nginx, or the CDN.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
