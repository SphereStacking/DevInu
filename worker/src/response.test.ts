import { describe, it, expect } from "vitest";
import { jsonResponse, emptyResponse } from "./response";

describe("jsonResponse", () => {
  it("returns correct Content-Type and default status 200", async () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns specified status code", async () => {
    const res = jsonResponse({ error: "bad" }, 400);
    expect(res.status).toBe(400);
  });
});

describe("emptyResponse", () => {
  it("returns null body and default status 204", async () => {
    const res = emptyResponse();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("returns specified status code", () => {
    const res = emptyResponse(202);
    expect(res.status).toBe(202);
  });
});
