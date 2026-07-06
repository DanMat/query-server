/**
 * @danmat/query-server
 *
 * Framework-agnostic server helpers for the HTTP QUERY method (RFC 10008),
 * built on Web-standard `Request`/`Response` — so they work in Hono, Deno,
 * Bun, Cloudflare Workers, and Node (via a web adapter).
 *
 * Validate incoming QUERY requests, enforce the RFC's `Content-Type`
 * requirement, negotiate the accepted query formats, and advertise them with
 * the `Accept-Query` response header.
 *
 * @see https://www.rfc-editor.org/rfc/rfc10008
 */

import {
  formatAcceptQuery,
  type MediaRangeInput,
  negotiateQuery,
} from "@danmat/accept-query";

/** The QUERY method name. */
export const QUERY_METHOD = "QUERY";

export interface QueryRequestOptions {
  /**
   * Also accept `POST` requests carrying `X-HTTP-Method-Override: QUERY` as
   * QUERY requests — the fallback that clients like `@danmat/query-fetch` use
   * for servers that don't route QUERY natively. Default `true`.
   */
  allowMethodOverride?: boolean;
}

export interface QueryValidationOptions extends QueryRequestOptions {
  /**
   * Media types this server accepts as query bodies. When provided, requests
   * with an unsupported `Content-Type` are rejected with `415` and an
   * `Accept-Query` header advertising these types.
   */
  accept?: MediaRangeInput[];
}

/**
 * An error describing why a request is not a valid QUERY, carrying the HTTP
 * status and headers that should be sent in response.
 */
export class QueryRequestError extends Error {
  override name = "QueryRequestError";
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(
    message: string,
    status: number,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.headers = headers;
    Object.setPrototypeOf(this, QueryRequestError.prototype);
  }

  /** Render this error as a JSON `Response` with the appropriate status/headers. */
  toResponse(): Response {
    return new Response(JSON.stringify({ error: this.message }), {
      status: this.status,
      headers: { "content-type": "application/json", ...this.headers },
    });
  }
}

/** Whether a request should be handled as a QUERY (honoring method override). */
export function isQueryRequest(
  request: Request,
  options: QueryRequestOptions = {},
): boolean {
  const { allowMethodOverride = true } = options;
  const method = request.method.toUpperCase();
  if (method === QUERY_METHOD) return true;
  if (allowMethodOverride && method === "POST") {
    return (
      (request.headers.get("x-http-method-override") ?? "").toUpperCase() ===
      QUERY_METHOD
    );
  }
  return false;
}

/** Build an `Accept-Query` header value from the media types a server accepts. */
export function acceptQueryHeader(mediaTypes: MediaRangeInput[]): string {
  return formatAcceptQuery(mediaTypes);
}

function isAccepted(contentType: string, accept: MediaRangeInput[]): boolean {
  return negotiateQuery(formatAcceptQuery(accept), [contentType]) !== null;
}

/**
 * Validate that `request` is a well-formed QUERY per RFC 10008. Throws a
 * {@link QueryRequestError} (with the right HTTP status) when it isn't:
 *
 * - not a QUERY request → `405 Method Not Allowed` (`Allow: QUERY`)
 * - missing `Content-Type` → `400 Bad Request`
 * - unsupported `Content-Type` (when `accept` is given) → `415` + `Accept-Query`
 */
export function assertQueryRequest(
  request: Request,
  options: QueryValidationOptions = {},
): void {
  const { accept, allowMethodOverride = true } = options;

  if (!isQueryRequest(request, { allowMethodOverride })) {
    throw new QueryRequestError(
      `Expected a ${QUERY_METHOD} request but received ${request.method}.`,
      405,
      { allow: QUERY_METHOD },
    );
  }

  const contentType = request.headers.get("content-type");
  if (!contentType) {
    throw new QueryRequestError(
      "A QUERY request must include a Content-Type (RFC 10008).",
      400,
    );
  }

  if (accept && accept.length > 0 && !isAccepted(contentType, accept)) {
    throw new QueryRequestError(
      `Unsupported query media type "${contentType}".`,
      415,
      { "accept-query": acceptQueryHeader(accept) },
    );
  }
}

/**
 * Non-throwing companion to {@link assertQueryRequest}. Returns an error
 * `Response` to send back, or `null` if the request is valid.
 *
 * @example
 * ```ts
 * const bad = checkQueryRequest(request, { accept: ["application/json"] });
 * if (bad) return bad;
 * const query = await readQueryJson(request);
 * ```
 */
export function checkQueryRequest(
  request: Request,
  options: QueryValidationOptions = {},
): Response | null {
  try {
    assertQueryRequest(request, options);
    return null;
  } catch (error) {
    if (error instanceof QueryRequestError) return error.toResponse();
    throw error;
  }
}

/**
 * Read a QUERY request body as JSON, guarding the content type. Throws a
 * {@link QueryRequestError} (`415` for a non-JSON type, `400` for invalid JSON).
 */
export async function readQueryJson<T = unknown>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/\bjson\b/i.test(contentType)) {
    throw new QueryRequestError(
      `Expected a JSON query body but Content-Type was "${contentType || "absent"}".`,
      415,
    );
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new QueryRequestError("Query body is not valid JSON.", 400);
  }
}

/** Return a copy of `response` with an `Accept-Query` header advertising `mediaTypes`. */
export function withAcceptQuery(
  response: Response,
  mediaTypes: MediaRangeInput[],
): Response {
  const headers = new Headers(response.headers);
  headers.set("accept-query", acceptQueryHeader(mediaTypes));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
