import type { Env, ReviewState } from "../types";
import { jsonResponse, emptyResponse } from "../response";

export class PRReviewDO implements DurableObject {
  ctx: DurableObjectState;
  env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      const state = await this.ctx.storage.get<ReviewState>("review");
      if (state === undefined) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      return jsonResponse(state);
    }

    if (request.method === "POST" && url.pathname === "/start") {
      let body: { prKey: string; containerId: string; webhookDeliveryId: string };
      try {
        body = (await request.json()) as {
          prKey: string;
          containerId: string;
          webhookDeliveryId: string;
        };
      } catch {
        return jsonResponse({ error: "invalid_payload" }, 400);
      }

      if (!body.prKey || !body.containerId || !body.webhookDeliveryId) {
        return jsonResponse({ error: "missing_fields" }, 400);
      }

      const existing = await this.ctx.storage.get<ReviewState>("review");
      if (existing !== undefined && existing.status === "running") {
        // cancel-in-progress: 既存を cancelled に更新
        const cancelled: ReviewState = { ...existing, status: "cancelled" };
        await this.ctx.storage.put("review", cancelled);
        console.log(`[PRReviewDO] cancelled previous review for ${existing.prKey}`);
      }

      const newState: ReviewState = {
        prKey: body.prKey,
        containerId: body.containerId,
        status: "running",
        startedAt: new Date().toISOString(),
        webhookDeliveryId: body.webhookDeliveryId,
      };
      await this.ctx.storage.put("review", newState);

      return jsonResponse(newState, 201);
    }

    if (request.method === "POST" && url.pathname === "/complete") {
      const existing = await this.ctx.storage.get<ReviewState>("review");
      if (existing === undefined) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      const updated: ReviewState = { ...existing, status: "completed" };
      await this.ctx.storage.put("review", updated);
      return jsonResponse(updated);
    }

    if (request.method === "POST" && url.pathname === "/cancel") {
      const existing = await this.ctx.storage.get<ReviewState>("review");
      if (existing === undefined) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      const updated: ReviewState = { ...existing, status: "cancelled" };
      await this.ctx.storage.put("review", updated);
      return jsonResponse(updated);
    }

    if (request.method === "DELETE" && url.pathname === "/") {
      await this.ctx.storage.delete("review");
      return emptyResponse();
    }

    return jsonResponse({ error: "not_found" }, 404);
  }
}

export class TokenCacheDO implements DurableObject {
  ctx: DurableObjectState;
  env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // パス: /token/{installation_id}
    const match = url.pathname.match(/^\/token\/(\d+)$/);
    if (!match) {
      return jsonResponse({ error: "invalid_path" }, 400);
    }

    const installationId = match[1];
    if (!installationId) {
      return jsonResponse({ error: "invalid_path" }, 400);
    }
    const stateKey = `token:${installationId}`;

    if (request.method === "GET") {
      const value = await this.ctx.storage.get<string>(stateKey);
      if (value === undefined) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      return new Response(value, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      let body: string;
      try {
        body = await request.text();
        // JSON として正当か確認
        JSON.parse(body);
      } catch {
        return jsonResponse({ error: "invalid_payload" }, 400);
      }
      await this.ctx.storage.put(stateKey, body);
      return emptyResponse();
    }

    if (request.method === "DELETE") {
      await this.ctx.storage.delete(stateKey);
      return emptyResponse();
    }

    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
}
