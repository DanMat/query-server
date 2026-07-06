import { describe, expect, it } from "vitest";
import {
  acceptQueryHeader,
  assertQueryRequest,
  checkQueryRequest,
  isQueryRequest,
  QueryRequestError,
  readQueryJson,
  withAcceptQuery,
} from "../src/index.js";

const queryReq = (init: RequestInit = {}) =>
  new Request("https://api.test/search", {
    method: "QUERY",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: 1 }),
    ...init,
  });

describe("isQueryRequest", () => {
  it("recognizes the QUERY method", () => {
    expect(isQueryRequest(queryReq())).toBe(true);
  });

  it("recognizes POST with a method-override header", () => {
    const req = new Request("https://api.test/s", {
      method: "POST",
      headers: { "x-http-method-override": "QUERY" },
    });
    expect(isQueryRequest(req)).toBe(true);
    expect(isQueryRequest(req, { allowMethodOverride: false })).toBe(false);
  });

  it("rejects a plain GET/POST", () => {
    expect(isQueryRequest(new Request("https://api.test/s"))).toBe(false);
    expect(
      isQueryRequest(new Request("https://api.test/s", { method: "POST" })),
    ).toBe(false);
  });
});

describe("assertQueryRequest", () => {
  it("passes a valid QUERY request", () => {
    expect(() => assertQueryRequest(queryReq())).not.toThrow();
  });

  it("rejects a non-QUERY method with 405 and Allow", () => {
    try {
      assertQueryRequest(new Request("https://api.test/s"));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(QueryRequestError);
      const err = error as QueryRequestError;
      expect(err.status).toBe(405);
      expect(err.headers.allow).toBe("QUERY");
    }
  });

  it("rejects a missing Content-Type with 400", () => {
    const req = new Request("https://api.test/s", { method: "QUERY" });
    expect(() => assertQueryRequest(req)).toThrow(QueryRequestError);
    try {
      assertQueryRequest(req);
    } catch (error) {
      expect((error as QueryRequestError).status).toBe(400);
    }
  });

  it("rejects an unsupported media type with 415 + Accept-Query", () => {
    const req = queryReq({ headers: { "content-type": "application/xml" } });
    try {
      assertQueryRequest(req, {
        accept: ["application/json", "application/sql"],
      });
      throw new Error("should have thrown");
    } catch (error) {
      const err = error as QueryRequestError;
      expect(err.status).toBe(415);
      expect(err.headers["accept-query"]).toBe(
        "application/json, application/sql",
      );
    }
  });

  it("accepts a supported media type (with charset param)", () => {
    const req = queryReq({
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(() =>
      assertQueryRequest(req, { accept: ["application/json"] }),
    ).not.toThrow();
  });

  it("accepts via a wildcard in the accept list", () => {
    const req = queryReq({ headers: { "content-type": "application/cbor" } });
    expect(() =>
      assertQueryRequest(req, { accept: ["application/*"] }),
    ).not.toThrow();
  });
});

describe("checkQueryRequest", () => {
  it("returns null for a valid request", () => {
    expect(checkQueryRequest(queryReq())).toBeNull();
  });

  it("returns an error Response for an invalid one", async () => {
    const res = checkQueryRequest(new Request("https://api.test/s"));
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(405);
    expect(res!.headers.get("allow")).toBe("QUERY");
    expect(await res!.json()).toEqual({ error: expect.any(String) });
  });
});

describe("readQueryJson", () => {
  it("parses a JSON body", async () => {
    expect(await readQueryJson(queryReq())).toEqual({ q: 1 });
  });

  it("rejects a non-JSON content type with 415", async () => {
    const req = queryReq({
      headers: { "content-type": "text/plain" },
      body: "q=1",
    });
    await expect(readQueryJson(req)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects invalid JSON with 400", async () => {
    const req = queryReq({ body: "{not json" });
    await expect(readQueryJson(req)).rejects.toMatchObject({ status: 400 });
  });
});

describe("header helpers", () => {
  it("acceptQueryHeader builds an Accept-Query value", () => {
    expect(
      acceptQueryHeader([
        "application/json",
        { type: "application", subtype: "sql", quality: 0.8 },
      ]),
    ).toBe("application/json, application/sql;q=0.8");
  });

  it("withAcceptQuery attaches the header to a response", () => {
    const res = withAcceptQuery(new Response("ok"), ["application/json"]);
    expect(res.headers.get("accept-query")).toBe("application/json");
  });
});
