# @danmat/query-server

[![CI](https://github.com/DanMat/query-server/actions/workflows/ci.yml/badge.svg)](https://github.com/DanMat/query-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@danmat/query-server.svg)](https://www.npmjs.com/package/@danmat/query-server)
[![minified + gzip size](https://img.shields.io/bundlejs/size/@danmat/query-server)](https://bundlejs.com/?q=@danmat/query-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Framework-agnostic **server** helpers for the HTTP QUERY method ([RFC 10008](https://www.rfc-editor.org/rfc/rfc10008)). Validate incoming QUERY requests, enforce the RFC's `Content-Type` rule, negotiate accepted query formats, and advertise them with `Accept-Query`.

Built on **Web-standard `Request`/`Response`**, so it runs anywhere they do — Hono, Deno, Bun, Cloudflare Workers, and Node (via a web adapter). Its only dependency is [`@danmat/accept-query`](https://github.com/DanMat/accept-query).

```ts
import { checkQueryRequest, readQueryJson, withAcceptQuery } from "@danmat/query-server";

const ACCEPTED = ["application/json", "application/sql"];

async function handler(request: Request): Promise<Response> {
  // Reject non-QUERY, missing/unsupported Content-Type — with correct status codes.
  const rejection = checkQueryRequest(request, { accept: ACCEPTED });
  if (rejection) return withAcceptQuery(rejection, ACCEPTED);

  const query = await readQueryJson<{ filter: unknown }>(request);
  const results = await runQuery(query);

  return withAcceptQuery(Response.json(results), ACCEPTED);
}
```

## Why?

RFC 10008 puts real obligations on the *server*: it MUST reject a QUERY whose `Content-Type` is missing, it should tell clients which query formats it accepts (via `Accept-Query`), and it needs to answer the method-override fallback that clients use when they're unsure the server speaks QUERY. This library packages those rules so your handler stays about *your* query logic.

## Install

```sh
npm install @danmat/query-server
```

## API

### `isQueryRequest(request, options?): boolean`

Whether a request should be handled as a QUERY. Recognizes the `QUERY` method and, by default, `POST` + `X-HTTP-Method-Override: QUERY` (the fallback used by clients like [`@danmat/query-fetch`](https://github.com/DanMat/query-fetch)). Disable with `{ allowMethodOverride: false }`.

### `assertQueryRequest(request, options?): void`

Throws a `QueryRequestError` (carrying the correct HTTP `status` and `headers`) when the request isn't a valid QUERY:

| Condition | Status | Extra |
| --- | --- | --- |
| Not a QUERY request | `405` | `Allow: QUERY` |
| Missing `Content-Type` | `400` | — |
| `Content-Type` not in `accept` | `415` | `Accept-Query: …` |

Pass `{ accept: ["application/json", …] }` to enable media-type negotiation (wildcards and parameters supported).

### `checkQueryRequest(request, options?): Response | null`

Non-throwing companion — returns a ready-to-send error `Response`, or `null` when the request is valid.

### `readQueryJson<T>(request): Promise<T>`

Reads the body as JSON, guarding the content type (`415` for a non-JSON type, `400` for malformed JSON).

### `acceptQueryHeader(mediaTypes): string`

Builds an `Accept-Query` header value from the media types you accept (strings and/or structured ranges with `q` weights).

### `withAcceptQuery(response, mediaTypes): Response`

Returns a copy of `response` with the `Accept-Query` header set — handy on both success and `415` responses.

### `conditional(request, response): Promise<Response>`

HTTP revalidation for QUERY results: attaches a strong `ETag`, and returns `304 Not Modified` when the request's `If-None-Match` already matches (echoing `Content-Location`/`Cache-Control`/`Vary`). Only applied to 2xx responses. QUERY is safe and cacheable, so this is exactly the method conditional requests are meant for.

```ts
return conditional(
  request,
  withContentLocation(withAcceptQuery(Response.json(results), ACCEPTED), request.url),
);
```

### `withContentLocation(response, location): Response`

Returns a copy of `response` with a `Content-Location` header (the URL identifying the returned representation).

### `etagFor(body): Promise<string>`

Computes a strong `ETag` (quoted SHA-256/base64url) for a body — equal bytes yield equal tags. Used by `conditional`, exposed for custom flows.

### `QueryRequestError`

`Error` subclass with `status: number`, `headers: Record<string,string>`, and `toResponse(): Response`.

## The `@danmat` QUERY suite

- [`@danmat/query-fetch`](https://github.com/DanMat/query-fetch) — client for the QUERY method.
- [`@danmat/accept-query`](https://github.com/DanMat/accept-query) — parse/build/negotiate `Accept-Query`.
- [`@danmat/query-cache`](https://github.com/DanMat/query-cache) — body-aware response caching.
- **`@danmat/query-server`** — server-side request validation & negotiation *(you are here)*.

▶️ **See them work together:** [query-suite-example](https://github.com/DanMat/query-suite-example) — a runnable demo using all four, with a **[🌐 live playground](https://query-suite-example.danmat.workers.dev)**.

## Interoperability

This suite's server behavior is checked in [**rfc10008-interop**](https://github.com/A1darbek/rfc10008-interop) — an independent, co-maintained RFC 10008 conformance matrix that runs the same checks against the [live example server](https://query-suite-example.danmat.workers.dev/stocks/search) and [Ayder](https://github.com/A1darbek/ayder), and publishes side-by-side receipts.

## License

[MIT](./LICENSE) © Dan Matthew
