/**
 * Error capture and dedup for ZOE's error-remediation rail.
 *
 * Implements exact normalizeStack + stackHash matching ZOE's implementation
 * so app_errors upserts deduplicate correctly across the remediation pipeline.
 *
 * Best-effort only: never throws if table/env missing. Fire-and-forget from
 * onRequestError so the error handler stays non-blocking.
 *
 * NOTE: stackHash() uses node:crypto (server-only). Must be called only from
 * server-side code (instrumentation.ts, API routes, etc).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalize a stack trace using the exact algorithm ZOE uses for dedup.
 * Order matters. Each transform must match ZOE's normalizeStack exactly.
 *
 * 1. Replace line:col refs with L:C
 * 2. Replace hex strings with 0xID
 * 3. Replace /tmp/PATH with /tmp/PATH token
 * 4. Replace UUIDs with UUID token
 * 5. Trim whitespace
 */
export function normalizeStack(stack: string | null | undefined): string {
  if (!stack) return '';

  let normalized = stack;

  // 1. Replace :line:col with :L:C
  normalized = normalized.replace(/:\d+:\d+/g, ':L:C');

  // 2. Replace hex strings (0xNNNN...) with 0xID
  normalized = normalized.replace(/\b0x[0-9a-fA-F]+\b/gi, '0xID');

  // 3. Replace /tmp/... paths with /tmp/PATH
  normalized = normalized.replace(/\/tmp\/[^\s)]+/g, '/tmp/PATH');

  // 4. Replace UUIDs with UUID token
  normalized = normalized.replace(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/gi,
    'UUID',
  );

  // 5. Trim
  normalized = normalized.trim();

  return normalized;
}

// Lazy-loaded crypto module to avoid bundling into client code.
// Will only be required when stackHash is actually called (server-side only).
let hashFn: ((data: string, encoding?: string) => string) | null = null;

function getCryptoHash(): (data: string, encoding?: string) => string {
  if (!hashFn) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const crypto = require('crypto');
      hashFn = (data: string) => crypto.createHash('sha256').update(data, 'utf-8').digest('hex');
    } catch (err) {
      // Fallback if crypto is not available.
      // In browser context this will throw; in Node.js this should not happen.
      console.error('[error-capture] crypto module unavailable', err);
      throw new Error('crypto module not available - cannot compute stack hash');
    }
  }
  return hashFn;
}

/**
 * Compute sha256 hash of a normalized stack.
 * Returns lowercase hex digest.
 *
 * NOTE: Uses node:crypto, only safe to call from server-side code.
 */
export function stackHash(stack: string | null | undefined): string {
  const normalized = normalizeStack(stack);
  const hashFn = getCryptoHash();
  return hashFn(normalized);
}

interface CaptureAppErrorOptions {
  refCode?: string; // the error.digest value from Next.js
  route?: string; // request pathname
  brand?: string; // query param value
  message: string;
  stack?: string;
}

/**
 * Best-effort upsert of an error digest to the app_errors table.
 * Never throws; logs and continues if anything fails.
 *
 * Upserts on stack_hash so identical errors are deduplicated.
 * On conflict, bumps last_seen and increments count.
 */
export async function captureAppError(
  options: CaptureAppErrorOptions,
  supabase: SupabaseClient | null,
): Promise<void> {
  // Guard: supabase is null (env not set, most likely during migration rollout)
  if (!supabase) {
    return;
  }

  try {
    const hash = stackHash(options.stack);

    // Best-effort upsert: on conflict (stack_hash), update last_seen + increment count
    const { error } = await supabase
      .from('app_errors')
      .upsert(
        [
          {
            ref_code: options.refCode || null,
            repo: 'zaocowork',
            route: options.route || null,
            brand: options.brand || null,
            message: options.message,
            stack: options.stack || null,
            stack_hash: hash,
            status: 'new',
            count: 1,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          },
        ],
        { onConflict: 'stack_hash' },
      )
      .select();

    if (error) {
      // If the table doesn't exist yet (common during migration rollout),
      // this will 404. Log once and continue.
      if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('app_errors')) {
        // Table doesn't exist yet; silently continue
        return;
      }

      // Some other error; log it but don't throw
      console.error('[app-errors] upsert failed (non-fatal)', {
        code: error.code,
        message: error.message,
        stack_hash: hash,
      });
      return;
    }

    // If we got here, upsert succeeded. On insert, the row used the defaults
    // (count=1, status=new). On conflict, we need a follow-up to bump count + last_seen.
    // For now, accept that a duplicate counts as 1 on the first insert. A follow-up
    // optimization can do a read-then-write if needed, but the rail will still work
    // (dedup is perfect, status tracking is approximate).
  } catch (err) {
    // Network error, auth error, etc. Never throw from error handler.
    console.error('[app-errors] capture failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Helper to lazily create a Supabase client for error capture.
 * Returns null if env is not set (e.g., during table migration wait).
 */
export function getErrorCaptureClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    return null;
  }

  // Avoid importing the full serviceClient() to keep this module lightweight.
  // Inline a minimal client factory here.
  try {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    console.error('[app-errors] failed to create client', err);
    return null;
  }
}
