import { describe, it, expect, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  Container: class MockContainer {},
  getContainer: vi.fn(),
}));

import { PRReviewDO, TokenCacheDO } from "./durable-objects";
import type { CachedToken } from "../types";
import { makeCtx, makeEnv } from "../../test/helpers";

const validBody = {
  prKey: "owner/repo#42",
  containerId: "review-owner-repo-42",
  webhookDeliveryId: "delivery-001",
};

describe("PRReviewDO", () => {
  describe("GET /", () => {
    it("returns 404 when state is empty", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(new Request("https://internal/", { method: "GET" }));
      expect(res.status).toBe(404);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("not_found");
    });

    it("returns current state when present", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-001",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(new Request("https://internal/", { method: "GET" }));
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string; prKey: string };
      expect(json.status).toBe("running");
      expect(json.prKey).toBe("owner/repo#42");
    });
  });

  describe("POST /start", () => {
    it("creates new state with status=running", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json() as { status: string; prKey: string; containerId: string };
      expect(json.status).toBe("running");
      expect(json.prKey).toBe("owner/repo#42");
      expect(json.containerId).toBe("review-owner-repo-42");
    });

    it("cancels running state before creating new state (cancel-in-progress)", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42-old",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-000",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const newBody = {
        prKey: "owner/repo#42",
        containerId: "review-owner-repo-42-new",
        webhookDeliveryId: "delivery-001",
      };

      const res = await do_.fetch(
        new Request("https://internal/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBody),
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json() as { status: string; containerId: string };
      expect(json.status).toBe("running");
      expect(json.containerId).toBe("review-owner-repo-42-new");
    });

    it("does not cancel completed state", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42-old",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-000",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      );
      expect(res.status).toBe(201);
      const stored = store.get("review") as { status: string };
      expect(stored.status).toBe("running");
    });

    it("returns 400 for invalid JSON", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/start", {
          method: "POST",
          body: "not-json{{{",
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing fields", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prKey: "owner/repo#42" }),
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /complete", () => {
    it("updates status to completed", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-001",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/complete", { method: "POST" })
      );
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string };
      expect(json.status).toBe("completed");
    });

    it("returns 404 when no state exists", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/complete", { method: "POST" })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /cancel", () => {
    it("updates status to cancelled", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-001",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/cancel", { method: "POST" })
      );
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string };
      expect(json.status).toBe("cancelled");
    });

    it("returns 404 when no state exists", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/cancel", { method: "POST" })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /", () => {
    it("removes state", async () => {
      const store = new Map<string, unknown>([
        [
          "review",
          {
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            webhookDeliveryId: "delivery-001",
          },
        ],
      ]);
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(new Request("https://internal/", { method: "DELETE" }));
      expect(res.status).toBe(204);
      expect(store.has("review")).toBe(false);
    });

    it("returns 204 even when state is empty", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(new Request("https://internal/", { method: "DELETE" }));
      expect(res.status).toBe(204);
    });
  });

  describe("unknown route", () => {
    it("returns 404 for unknown path", async () => {
      const store = new Map<string, unknown>();
      const do_ = new PRReviewDO(makeCtx(store), makeEnv());

      const res = await do_.fetch(
        new Request("https://internal/unknown", { method: "GET" })
      );
      expect(res.status).toBe(404);
    });
  });
});

describe("TokenCacheDO", () => {
  it("GET returns 404 when token not in state", async () => {
    const store = new Map<string, unknown>();
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const response = await do_.fetch(
      new Request("https://internal/token/42", { method: "GET" })
    );
    expect(response.status).toBe(404);
  });

  it("PUT stores token, GET retrieves it", async () => {
    const store = new Map<string, unknown>();
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const cached: CachedToken = {
      token: "ghs_test",
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    const body = JSON.stringify(cached);

    const putResponse = await do_.fetch(
      new Request("https://internal/token/42", {
        method: "PUT",
        body,
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(putResponse.status).toBe(204);

    const getResponse = await do_.fetch(
      new Request("https://internal/token/42", { method: "GET" })
    );
    expect(getResponse.status).toBe(200);
    const retrieved = await getResponse.json() as CachedToken;
    expect(retrieved.token).toBe("ghs_test");
  });

  it("DELETE removes stored token", async () => {
    const store = new Map<string, unknown>([
      ["token:55", JSON.stringify({ token: "ghs_del", expiresAt: "2099-01-01T00:00:00Z" })],
    ]);
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const delResponse = await do_.fetch(
      new Request("https://internal/token/55", { method: "DELETE" })
    );
    expect(delResponse.status).toBe(204);

    const getResponse = await do_.fetch(
      new Request("https://internal/token/55", { method: "GET" })
    );
    expect(getResponse.status).toBe(404);
  });

  it("returns 400 for invalid path", async () => {
    const store = new Map<string, unknown>();
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const response = await do_.fetch(
      new Request("https://internal/invalid/path", { method: "GET" })
    );
    expect(response.status).toBe(400);
  });

  it("returns 405 for unsupported method", async () => {
    const store = new Map<string, unknown>();
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const response = await do_.fetch(
      new Request("https://internal/token/1", { method: "POST" })
    );
    expect(response.status).toBe(405);
  });

  it("returns 400 for PUT with invalid JSON", async () => {
    const store = new Map<string, unknown>();
    const do_ = new TokenCacheDO(makeCtx(store), makeEnv());

    const response = await do_.fetch(
      new Request("https://internal/token/1", {
        method: "PUT",
        body: "not-valid-json{{{",
      })
    );
    expect(response.status).toBe(400);
  });
});
