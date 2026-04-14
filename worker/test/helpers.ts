import type { Env } from "../src/types";

export async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

export async function makeSignedRequest(
  payload: object,
  event: string,
  secret: string
): Promise<Request> {
  const body = JSON.stringify(payload);
  const sig = await signBody(secret, body);
  return new Request("https://worker.example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": sig,
      "X-GitHub-Event": event,
    },
    body,
  });
}

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: "",
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
    ANTHROPIC_API_KEY: "sk-test",
    PR_REVIEW: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: async () => new Response(null, { status: 404 }),
      }),
    } as unknown as DurableObjectNamespace,
    TOKEN_CACHE: {} as DurableObjectNamespace,
    CONTAINER: {},
    MIN_SEVERITY: "medium",
    MAX_BUDGET_USD: "5",
    LANGUAGE: "ja",
    ...overrides,
  } as unknown as Env;
}

export function makeCtx(store: Map<string, unknown> = new Map()): DurableObjectState {
  return {
    storage: {
      get: async <T>(key: string): Promise<T | undefined> => {
        return store.get(key) as T | undefined;
      },
      put: async (key: string, value: unknown): Promise<void> => {
        store.set(key, value);
      },
      delete: async (key: string): Promise<boolean> => {
        return store.delete(key);
      },
    },
  } as unknown as DurableObjectState;
}

export const BASE_REPO = {
  full_name: "owner/repo",
  owner: { login: "owner" },
  name: "repo",
};

export const BASE_INSTALLATION = { id: 42 };
