/**
 * 統合テスト — Workers エンドポイント
 *
 * Miniflare は設定が複雑なため、handleWebhook / handleSetupManifest /
 * handleSetupCallback 関数を直接呼び出す形式で書く。
 * HMAC 署名を正しく計算してヘッダに含める。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  Container: class MockContainer {},
  getContainer: vi.fn(),
}));

vi.mock("../infra/auth", () => ({
  getInstallationToken: vi.fn().mockResolvedValue("ghs_test_token"),
}));

vi.mock("../core/review", () => ({
  startReview: vi.fn().mockResolvedValue(undefined),
  cancelReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../infra/container", () => ({
  ChollowsContainer: class MockChollowsContainer {},
}));

vi.mock("../infra/error", () => ({
  postErrorComment: vi.fn().mockResolvedValue(undefined),
}));

import { handleWebhook } from "./webhook";
import { handleSetupManifest, handleSetupCallback } from "./setup";
import { signBody, makeEnv } from "../../test/helpers";

const WEBHOOK_SECRET = "integration-test-secret";

function env(overrides: Parameters<typeof makeEnv>[0] = {}) {
  return makeEnv({ GITHUB_APP_ID: "99999", GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET, ...overrides });
}

function makeWebhookRequest(body: string, signature: string, event = "pull_request"): Request {
  return new Request("https://worker.example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
      "X-GitHub-Event": event,
    },
    body,
  });
}

describe("handleWebhook integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /webhook + valid signature → 200", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeWebhookRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("POST /webhook + invalid signature → 401", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const request = makeWebhookRequest(body, "sha256=badhexbadhex00", "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_signature");
  });

  it("POST /webhook + missing signature header → 401", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const request = new Request("https://worker.example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "pull_request",
      },
      body,
    });

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
  });

  it("POST /webhook + invalid JSON body + valid signature → 400", async () => {
    const body = "{{invalid json}}";
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeWebhookRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_payload");
  });

  it("POST /webhook + wrong secret → 401", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const sig = await signBody("wrong-secret", body);
    const request = makeWebhookRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
  });

  it("issue_comment.created event with valid signature → 200", async () => {
    const body = JSON.stringify({ action: "created" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeWebhookRequest(body, sig, "issue_comment");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("pull_request.closed event with valid signature → 200", async () => {
    const body = JSON.stringify({ action: "closed" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeWebhookRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("unknown event with valid signature → 200 (ignored)", async () => {
    const body = JSON.stringify({ action: "unknown_action" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeWebhookRequest(body, sig, "unknown_event");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });
});

describe("handleSetupManifest integration", () => {
  it("GET /setup/manifest → 200 with HTML content", async () => {
    const request = new Request("https://worker.example.com/setup/manifest", {
      method: "GET",
    });

    const response = await handleSetupManifest(request, env());
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("<form");
    expect(html).toContain("manifest");
  });

  it("manifest form contains correct hook URL pointing to /webhook", async () => {
    const request = new Request("https://worker.example.com/setup/manifest", {
      method: "GET",
    });

    const response = await handleSetupManifest(request, env());
    const html = await response.text();

    expect(html).toContain("worker.example.com/webhook");
  });
});

describe("handleSetupCallback integration", () => {
  it("GET /setup/callback without code parameter → 400", async () => {
    const request = new Request("https://worker.example.com/setup/callback", {
      method: "GET",
    });

    const response = await handleSetupCallback(request, env());
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("missing_code");
  });

  it("GET /setup/callback with invalid code (special chars) → 400", async () => {
    const request = new Request("https://worker.example.com/setup/callback?code=abc!@#$", {
      method: "GET",
    });

    const response = await handleSetupCallback(request, env());
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_code");
  });

  it("GET /setup/callback with valid code format + GitHub API failure → 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Not Found" }), { status: 422 })
      )
    );

    const request = new Request("https://worker.example.com/setup/callback?code=validcode123", {
      method: "GET",
    });

    const response = await handleSetupCallback(request, env());
    expect(response.status).toBe(502);
  });

  it("GET /setup/callback with valid code + successful GitHub API → 200 with HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 12345,
            pem: "fake-pem",
            webhook_secret: "fake-secret",
          }),
          { status: 201 }
        )
      )
    );

    const request = new Request("https://worker.example.com/setup/callback?code=validcode123", {
      method: "GET",
    });

    const response = await handleSetupCallback(request, env());
    expect(response.status).toBe(200);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("12345");
  });
});
