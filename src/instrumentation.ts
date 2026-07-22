/*
 * Next.js Instrumentation Hook
 * Captures server-side errors with full context and logs them to the console
 * for Vercel logs, making them greppable by digest or prefix.
 *
 * In production, Next.js redacts error messages in the client error boundary,
 * but this hook receives the full unredacted Error object, digest, and request
 * context. Logging here makes the real error visible in Vercel logs.
 */

import { NextRequest } from 'next/server';

interface InstrumentationContext {
  routerKind?: 'app' | 'pages';
  routePath?: string;
}

export async function onRequestError(
  error: unknown,
  request: NextRequest | { url?: string; method?: string },
  context: InstrumentationContext,
): Promise<void> {
  // Extract the actual error details
  let message = 'Unknown error';
  let name = 'Error';
  let stack = '';

  if (error instanceof Error) {
    message = error.message;
    name = error.name;
    stack = error.stack || '';
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as Record<string, unknown>).message);
    name = String((error as Record<string, unknown>).name || 'Error');
  } else {
    message = String(error);
  }

  // Truncate stack to ~1500 chars to keep logs reasonable
  const truncatedStack = stack.substring(0, 1500);

  // Extract path from request
  let url: string | undefined;
  if (request instanceof NextRequest) {
    url = request.nextUrl.pathname;
  } else if (request && typeof request === 'object' && 'url' in request) {
    try {
      const urlObj = new URL(String(request.url));
      url = urlObj.pathname;
    } catch {
      url = String(request.url);
    }
  }

  // Log to console with a stable prefix for Vercel log grepping
  // Format: [zao-cowork onRequestError] <JSON>
  const logEntry = JSON.stringify(
    {
      message,
      name,
      url,
      routerKind: context.routerKind,
      routePath: context.routePath,
      stack: truncatedStack,
    },
    null,
    0, // no pretty-print, keep it on one line
  );

  console.error(`[zao-cowork onRequestError] ${logEntry}`);
}
