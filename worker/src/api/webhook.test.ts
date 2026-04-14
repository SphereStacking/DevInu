import { describe, it, expect, vi } from "vitest";

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
import { signBody, makeEnv } from "../../test/helpers";

const WEBHOOK_SECRET = "test-webhook-secret";

function makeRequest(body: string, signature: string, event = "push"): Request {
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

function env() {
  return makeEnv({ GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET });
}

describe("handleWebhook", () => {
  it("returns 401 for missing signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const request = new Request("https://worker.example.com/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GitHub-Event": "push" },
      body,
    });

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_signature");
  });

  it("returns 401 for invalid signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const request = makeRequest(body, "sha256=badhexbadhex", "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_signature");
  });

  it("returns 401 when signature is for different body", async () => {
    const body = JSON.stringify({ action: "opened" });
    const wrongSig = await signBody(WEBHOOK_SECRET, "different body");
    const request = makeRequest(body, wrongSig, "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
  });

  it("returns 200 for valid signature and unknown event", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("returns 200 for pull_request.review_requested", async () => {
    const body = JSON.stringify({ action: "review_requested" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("returns 200 for issue_comment.created", async () => {
    const body = JSON.stringify({ action: "created" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "issue_comment");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("returns 200 for pull_request.closed", async () => {
    const body = JSON.stringify({ action: "closed" });
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "pull_request");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(200);
  });

  it("returns 401 for signature without sha256= prefix", async () => {
    const body = JSON.stringify({ action: "opened" });
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const request = makeRequest(body, hex, "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_signature");
  });

  it("computes correct HMAC for empty body", async () => {
    const body = "";
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "push");

    const response = await handleWebhook(request, env());
    expect(response.status).not.toBe(401);
  });

  it("returns 400 for invalid JSON body with valid signature", async () => {
    const body = "not-json{{{";
    const sig = await signBody(WEBHOOK_SECRET, body);
    const request = makeRequest(body, sig, "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_payload");
  });

  it("returns 401 for signature with wrong secret", async () => {
    const body = JSON.stringify({ action: "opened" });
    const wrongSig = await signBody("wrong-secret", body);
    const request = makeRequest(body, wrongSig, "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
  });

  it("returns 401 for odd-length hex in signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const request = makeRequest(body, "sha256=abc", "push");

    const response = await handleWebhook(request, env());
    expect(response.status).toBe(401);
  });
});
