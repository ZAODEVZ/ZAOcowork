// Shared input validation for the external /api/v1/* routes. Bots are trusted
// infra, but "trusted" still means bounded: an unbounded request body is parsed
// into memory before any per-field slicing, and a deeply-nested/huge meta or
// args object can bloat a row. These helpers cap both, and normalize the error
// shape to the routes' existing { ok: false, error } contract.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 64 KB is generous for a task/command/event and blocks abuse.
const MAX_BODY_BYTES = 64_000;

/**
 * Read a JSON object body with a hard size cap. Throws ApiError (413/400) which
 * the route turns into a response via apiError(). An empty body yields {} so
 * callers that treat the body as optional (heartbeat) keep working.
 */
export async function readJsonObject(
  req: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) {
    throw new ApiError(413, `request body too large (max ${maxBytes} bytes)`);
  }
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(400, "body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Required trimmed string with a max length. */
export function reqString(v: unknown, field: string, max = 2000): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new ApiError(400, `${field} is required`);
  }
  const t = v.trim();
  if (t.length > max) throw new ApiError(400, `${field} too long (max ${max})`);
  return t;
}

/** Optional string with a max length (undefined/null -> undefined). */
export function optString(v: unknown, field: string, max = 4000): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ApiError(400, `${field} must be a string`);
  if (v.length > max) throw new ApiError(400, `${field} too long (max ${max})`);
  return v;
}

/** Optional plain object with a serialized-size cap (for meta/args/result). */
export function optObject(
  v: unknown,
  field: string,
  maxBytes = 8_000,
): Record<string, unknown> | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError(400, `${field} must be an object`);
  }
  if (JSON.stringify(v).length > maxBytes) {
    throw new ApiError(400, `${field} too large (max ${maxBytes} bytes)`);
  }
  return v as Record<string, unknown>;
}

/** Turn a thrown ApiError into a Response; anything else -> generic 500. */
export function apiError(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ ok: false, error: e.message }, { status: e.status });
  }
  // Never leak an unexpected internal error/message to an external caller.
  return Response.json({ ok: false, error: "internal error" }, { status: 500 });
}
