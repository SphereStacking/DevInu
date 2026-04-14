import { Container } from "@cloudflare/containers";
import type { Env } from "../types";
import { jsonResponse } from "../response";

export class ChollowsContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = "30m";
  override manualStart = true;

  override async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      let envVars: Record<string, string> = {};
      try {
        const body = (await request.json()) as { envVars?: Record<string, string> };
        envVars = body.envVars ?? {};
      } catch {
        return jsonResponse({ error: "invalid_body" }, 400);
      }

      if (this.ctx.container.running) {
        return jsonResponse({ ok: true, status: "already_running" });
      }

      await this.start({ envVars });
      return jsonResponse({ ok: true, status: "started" });
    }

    // GET: ステータス確認用
    return jsonResponse({ running: this.ctx.container.running });
  }
}
