import { describe, it, expect } from "vitest";
import { readJsonObject, reqString, optString, optObject, ApiError } from "./api-validate";

function post(body: string): Request {
  return new Request("http://x/api", { method: "POST", body });
}

async function err(fn: () => Promise<unknown> | unknown): Promise<ApiError> {
  try {
    await fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected throw");
}

describe("readJsonObject", () => {
  it("parses a JSON object", async () => {
    expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 });
  });
  it("returns {} for an empty body", async () => {
    expect(await readJsonObject(post(""))).toEqual({});
  });
  it("413s when over the byte cap", async () => {
    const big = JSON.stringify({ x: "z".repeat(200) });
    expect((await err(() => readJsonObject(post(big), 50))).status).toBe(413);
  });
  it("400s on invalid JSON", async () => {
    expect((await err(() => readJsonObject(post("{not json")))).status).toBe(400);
  });
  it("400s when the body is an array, not an object", async () => {
    expect((await err(() => readJsonObject(post("[1,2]")))).status).toBe(400);
  });
});

describe("field helpers", () => {
  it("reqString trims and enforces max", () => {
    expect(reqString("  hi  ", "f")).toBe("hi");
    expect(err(() => reqString("", "f")).then((e) => e.status)).resolves.toBe(400);
    expect(err(() => reqString("toolong", "f", 3)).then((e) => e.status)).resolves.toBe(400);
  });
  it("optString allows undefined but caps length", () => {
    expect(optString(undefined, "f")).toBeUndefined();
    expect(err(() => optString("abcd", "f", 2)).then((e) => e.status)).resolves.toBe(400);
  });
  it("optObject rejects arrays and oversized objects", () => {
    expect(optObject({ a: 1 }, "f")).toEqual({ a: 1 });
    expect(err(() => optObject([1], "f")).then((e) => e.status)).resolves.toBe(400);
    expect(err(() => optObject({ x: "z".repeat(100) }, "f", 50)).then((e) => e.status)).resolves.toBe(400);
  });
});
