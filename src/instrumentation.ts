/*
 * Next.js Instrumentation Hook
 * Captures server-side errors with full context and logs them to the console
 * for Vercel logs, making them greppable by digest or prefix.
 *
 * Additionally, upserts errors to the app_errors table (best-effort, fire-and-forget)
 * so ZOE's error-remediation rail can auto-fix recurring issues.
 *
 * In production, Next.js redacts error messages in the client error boundary,
 * but this hook receives the full unredacted Error object, digest, and request
 * context. Logging here makes the real error visible in Vercel logs. The upsert
 * to app_errors is non-blocking and never throws.
 */

import { NextRequest } from 'next/server';
import { captureAppError, getErrorCaptureClient } from '@/lib/error-capture';

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
  let digest: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    name = error.name;
    stack = error.stack || '';
    // Check for Next.js digest attached to Error object
    digest = (error as unknown as Record<string, unknown>).digest as string | undefined;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as Record<string, unknown>).message);
    name = String((error as Record<string, unknown>).name || 'Error');
    digest = (error as Record<string, unknown>).digest as string | undefined;
  } else {
    message = String(error);
  }

  // Truncate stack to ~1500 chars to keep logs reasonable
  const truncatedStack = stack.substring(0, 1500);

  // Extract path and brand from request
  let url: string | undefined;
  let brand: string | undefined;

  if (request instanceof NextRequest) {
    url = request.nextUrl.pathname;
    brand = request.nextUrl.searchParams.get('brand') ?? undefined;
  } else if (request && typeof request === 'object' && 'url' in request) {
    try {
      const urlObj = new URL(String(request.url));
      url = urlObj.pathname;
      brand = urlObj.searchParams.get('brand') ?? undefined;
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
      digest,
    },
    null,
    0, // no pretty-print, keep it on one line
  );

  console.error(`[zao-cowork onRequestError] ${logEntry}`);

  // Fire-and-forget: upsert to app_errors for ZOE's remediation rail.
  // This is best-effort and never throws; if the table doesn't exist
  // (common during migration rollout) it silently continues.
  // Wrapped in a setTimeout to ensure it doesn't block error logging.
  setTimeout(() => {
    const supabase = getErrorCaptureClient();
    captureAppError(
      {
        refCode: digest,
        route: url,
        brand,
        message,
        stack: truncatedStack,
      },
      supabase,
    ).catch(() => {
      // Silently swallow capture errors; they were already logged above
    });
  }, 0);
}
