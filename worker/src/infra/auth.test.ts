import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { generateJwt, getInstallationToken } from "./auth";
import type { Env } from "../types";

const PRIVATE_KEY_PEM = readFileSync(
  join(__dirname, "../../test/fixtures/private_key.pem"),
  "utf-8"
);
const PUBLIC_KEY_PEM = readFileSync(
  join(__dirname, "../../test/fixtures/public_key.pem"),
  "utf-8"
);

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padding);
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0)).buffer;
  return crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

describe("generateJwt", () => {
  it("generates a valid RS256 JWT with correct structure", async () => {
    const appId = "12345";
    const jwt = await generateJwt(appId, PRIVATE_KEY_PEM);

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");
  });

  it("includes correct claims: iss, iat, exp", async () => {
    const appId = "99999";
    const before = Math.floor(Date.now() / 1000);
    const jwt = await generateJwt(appId, PRIVATE_KEY_PEM);
    const after = Math.floor(Date.now() / 1000);

    const parts = jwt.split(".");
    const claimsRaw = parts[1]!;
    const padded = claimsRaw.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(padded + "=".repeat((4 - padded.length % 4) % 4)));

    expect(claims.iss).toBe(appId);
    // iat は now - 60 に設定される（GitHub クロックスキュー対策）
    expect(claims.iat).toBeGreaterThanOrEqual(before - 60);
    expect(claims.iat).toBeLessThanOrEqual(after - 60);
    expect(claims.exp).toBe(claims.iat + 660);
  });

  it("exp is iat + 660 (iat is now-60, exp is now+600)", async () => {
    const jwt = await generateJwt("12345", PRIVATE_KEY_PEM);
    const parts = jwt.split(".");
    const claimsRaw = parts[1]!;
    const padded = claimsRaw.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(padded + "=".repeat((4 - padded.length % 4) % 4)));

    expect(claims.exp - claims.iat).toBe(660);
  });

  it("produces a verifiable RS256 signature", async () => {
    const jwt = await generateJwt("12345", PRIVATE_KEY_PEM);
    const parts = jwt.split(".");
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]!);

    const publicKey = await importPublicKey(PUBLIC_KEY_PEM);
    const encoder = new TextEncoder();
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      encoder.encode(signingInput)
    );
    expect(valid).toBe(true);
  });

  it("throws when PEM format is invalid (not base64)", async () => {
    const badPem = "-----BEGIN RSA PRIVATE KEY-----\nnot-valid-base64!!!\n-----END RSA PRIVATE KEY-----";
    await expect(generateJwt("12345", badPem)).rejects.toThrow();
  });

  it("iss claim matches the appId argument", async () => {
    const appId = "app-id-42";
    const jwt = await generateJwt(appId, PRIVATE_KEY_PEM);
    const parts = jwt.split(".");
    const claimsRaw = parts[1]!;
    const padded = claimsRaw.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(padded + "=".repeat((4 - padded.length % 4) % 4)));

    expect(claims.iss).toBe(appId);
  });
});

// TokenCacheDO stub を作る DO fetch モック
function makeMockEnv(
  cacheStore: Map<string, string>,
  fetchResponder?: (url: string, init?: RequestInit) => Promise<Response>
): Env {
  const makeStub = (installationId: string): DurableObjectStub => {
    const stateKey = `token:${installationId}`;
    return {
      fetch: async (request: Request | string | URL, _init?: RequestInit | RequestInitCfProperties): Promise<Response> => {
        const req = typeof request === "string" || request instanceof URL
          ? new Request(request)
          : request;
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/token\/(\d+)$/);
        if (!match) {
          return new Response(JSON.stringify({ error: "invalid_path" }), { status: 400 });
        }

        if (req.method === "GET") {
          const val = cacheStore.get(stateKey);
          if (val === undefined) {
            return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
          }
          return new Response(val, { status: 200 });
        }
        if (req.method === "PUT") {
          const body = await req.text();
          cacheStore.set(stateKey, body);
          return new Response(null, { status: 204 });
        }
        if (req.method === "DELETE") {
          cacheStore.delete(stateKey);
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 405 });
      },
    } as unknown as DurableObjectStub;
  };

  const makeNamespace = (): DurableObjectNamespace => ({
    idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
    get: (id: DurableObjectId) => makeStub(id.toString().split(":")[1] ?? "0"),
    newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
    idFromString: (s: string) => ({ toString: () => s }) as DurableObjectId,
    jurisdiction: undefined,
  } as unknown as DurableObjectNamespace);

  return {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY_PEM,
    GITHUB_WEBHOOK_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "sk-test",
    PR_REVIEW: makeNamespace(),
    TOKEN_CACHE: makeNamespace(),
    CONTAINER: {},
    MIN_SEVERITY: "medium",
    MAX_BUDGET_USD: "5",
    LANGUAGE: "ja",
    __fetchResponder: fetchResponder,
  } as unknown as Env;
}

describe("getInstallationToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches token from API when cache is empty", async () => {
    const cacheStore = new Map<string, string>();
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mockToken = "ghs_mocktoken123";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ token: mockToken, expires_at: futureExpiry }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const env = makeMockEnv(cacheStore);
    const token = await getInstallationToken(42, env, "https://api.github.com");

    expect(token).toBe(mockToken);
    // キャッシュに保存されているか確認
    expect(cacheStore.has("token:42")).toBe(true);
  });

  it("returns cached token without calling API when cache is fresh", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const cachedToken = "ghs_cachedtoken456";
    const cacheStore = new Map<string, string>([
      ["token:99", JSON.stringify({ token: cachedToken, expiresAt: futureExpiry })],
    ]);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env = makeMockEnv(cacheStore);
    const token = await getInstallationToken(99, env, "https://api.github.com");

    expect(token).toBe(cachedToken);
    // API は呼ばれない
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes token when cache is expired (within 5 minutes)", async () => {
    // 3分後に切れる = 5分マージン以内 → 期限切れ扱い
    const nearExpiry = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const oldToken = "ghs_oldtoken";
    const newToken = "ghs_newtoken789";
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const cacheStore = new Map<string, string>([
      ["token:77", JSON.stringify({ token: oldToken, expiresAt: nearExpiry })],
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ token: newToken, expires_at: futureExpiry }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const env = makeMockEnv(cacheStore);
    const token = await getInstallationToken(77, env, "https://api.github.com");

    expect(token).toBe(newToken);
  });

  it("throws when API returns non-2xx status", async () => {
    const cacheStore = new Map<string, string>();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
      )
    );

    const env = makeMockEnv(cacheStore);
    await expect(getInstallationToken(1, env, "https://api.github.com")).rejects.toThrow(
      "Failed to get installation token: HTTP 404"
    );
  });
});
