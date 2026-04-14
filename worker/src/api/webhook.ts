import type { Env, GitHubWebhookPayload } from "../types";
import { reviewRequestedHandler, issueCommentHandler, prClosedHandler } from "./handlers";
import { jsonResponse } from "../response";

async function verifySignature(
  secret: string,
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  try {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const expectedHex = signatureHeader.slice("sha256=".length);
    // 16進数文字列を ArrayBuffer に変換
    if (expectedHex.length % 2 !== 0) {
      return false;
    }
    const expectedBytes = new Uint8Array(expectedHex.length / 2);
    for (let i = 0; i < expectedHex.length; i += 2) {
      const byte = parseInt(expectedHex.slice(i, i + 2), 16);
      if (isNaN(byte)) {
        return false;
      }
      expectedBytes[i / 2] = byte;
    }

    return await crypto.subtle.verify("HMAC", key, expectedBytes.buffer, encoder.encode(body));
  } catch (err) {
    console.error(`[webhook] verifySignature error: ${String(err)}`);
    return false;
  }
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error("[webhook] GITHUB_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const bodyText = await request.text().catch(() => null);
  if (bodyText === null) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const signatureHeader = request.headers.get("X-Hub-Signature-256");
  const valid = await verifySignature(env.GITHUB_WEBHOOK_SECRET, bodyText, signatureHeader);
  if (!valid) {
    console.error("[webhook] signature verification failed");
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: GitHubWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as GitHubWebhookPayload;
  } catch {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const githubEvent = request.headers.get("X-GitHub-Event") ?? "";
  const deliveryId = request.headers.get("X-GitHub-Delivery") ?? "";
  const action = payload.action ?? "";

  if (githubEvent === "pull_request" && action === "review_requested") {
    return reviewRequestedHandler(payload, env, deliveryId);
  }

  if (githubEvent === "issue_comment" && action === "created") {
    return issueCommentHandler(payload, env, deliveryId);
  }

  if (githubEvent === "pull_request" && action === "closed") {
    return prClosedHandler(payload, env);
  }

  // その他のイベントは 200 で無視
  return jsonResponse({ ok: true });
}
