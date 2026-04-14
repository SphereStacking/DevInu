import type { CachedToken, Env, InstallationAccessTokenResponse } from "../types";

function base64urlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function jsonToBase64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return base64urlEncode(bytes.buffer as ArrayBuffer);
}

function pemToDer(pem: string): ArrayBuffer {
  // PEM ヘッダ/フッタと空白を除去
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");

  const binaryStr = atob(stripped);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateJwt(appId: string, privateKeyPem: string): Promise<string> {
  const der = pemToDer(privateKeyPem);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  // GitHub 推奨: クロックスキュー対策で iat を 60 秒前に設定
  const claims = {
    iss: appId,
    iat: now - 60,
    exp: now + 600,
  };

  const headerB64 = jsonToBase64url(header);
  const claimsB64 = jsonToBase64url(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput)
  );

  const signatureB64 = base64urlEncode(signature);
  return `${signingInput}.${signatureB64}`;
}

export async function getInstallationToken(
  installationId: number,
  env: Env,
  githubApiBase = "https://api.github.com"
): Promise<string> {
  // キャッシュを先に確認
  const cached = await getCachedToken(installationId, env);
  if (cached !== null) {
    return cached;
  }

  const jwt = await generateJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);

  const url = `${githubApiBase}/app/installations/${installationId}/access_tokens`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "chollows-worker/0.1.0",
    },
  });

  if (!response.ok) {
    const status = response.status;
    // エラー詳細はログに残すが token の内容は出さない
    console.error(`[auth] installation token request failed: HTTP ${status}`);
    throw new Error(`Failed to get installation token: HTTP ${status}`);
  }

  const data = (await response.json()) as InstallationAccessTokenResponse;
  if (!data.token || !data.expires_at) {
    console.error("[auth] installation token response missing required fields");
    throw new Error("Invalid installation token response");
  }

  const cached2: CachedToken = {
    token: data.token,
    expiresAt: data.expires_at,
  };

  await setCachedToken(installationId, cached2, env);

  return data.token;
}

async function getCachedToken(installationId: number, env: Env): Promise<string | null> {
  const stub = getTokenCacheStub(installationId, env);

  const response = await stub.fetch(
    new Request(`https://internal/token/${installationId}`, { method: "GET" })
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    console.error(`[auth] token cache GET failed: HTTP ${response.status}`);
    return null;
  }

  let cached: CachedToken;
  try {
    cached = (await response.json()) as CachedToken;
  } catch {
    console.error("[auth] token cache response parse error");
    return null;
  }

  const expiresAt = new Date(cached.expiresAt).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - fiveMinutes > now) {
    return cached.token;
  }

  // 有効期限切れ間近 → キャッシュ削除して null 返却
  await stub.fetch(
    new Request(`https://internal/token/${installationId}`, { method: "DELETE" })
  );
  return null;
}

async function setCachedToken(
  installationId: number,
  cached: CachedToken,
  env: Env
): Promise<void> {
  const stub = getTokenCacheStub(installationId, env);
  const body = JSON.stringify(cached);

  const response = await stub.fetch(
    new Request(`https://internal/token/${installationId}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": "application/json" },
    })
  );

  if (!response.ok) {
    console.error(`[auth] token cache PUT failed: HTTP ${response.status}`);
  }
}

function getTokenCacheStub(installationId: number, env: Env): DurableObjectStub {
  const id = env.TOKEN_CACHE.idFromName(`installation:${installationId}`);
  return env.TOKEN_CACHE.get(id);
}
