import { Hono } from "hono";
import type { Env } from "./types";
import { handleWebhook, handleSetupManifest, handleSetupCallback } from "./api";

export { ChollowsContainer, PRReviewDO, TokenCacheDO } from "./infra";
export type { ReviewState } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.post("/webhook", (c) => handleWebhook(c.req.raw, c.env));
app.get("/setup/manifest", (c) => handleSetupManifest(c.req.raw, c.env));
app.get("/setup/callback", (c) => handleSetupCallback(c.req.raw, c.env));

export default app;
