import type { Env } from "../types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleSetupManifest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const workerUrl = `${url.protocol}//${url.host}`;

  const githubServerUrl = env.GITHUB_SERVER_URL ?? "https://github.com";
  const actionUrl = `${githubServerUrl}/settings/apps/new`;

  const manifest = {
    name: "Chollows",
    url: workerUrl,
    hook_attributes: { url: `${workerUrl}/webhook` },
    redirect_url: `${workerUrl}/setup/callback`,
    public: false,
    default_permissions: {
      pull_requests: "write",
      issues: "write",
      contents: "read",
    },
    default_events: ["pull_request", "issue_comment"],
  };

  const manifestJson = escapeHtml(JSON.stringify(manifest));
  const escapedActionUrl = escapeHtml(actionUrl);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chollows - GitHub App 登録</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f6f8fa; }
    .container { text-align: center; padding: 2rem; }
    p { color: #57606a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏚️ Chollows</h1>
    <p>GitHub App を登録しています...</p>
    <form id="manifest-form" method="post" action="${escapedActionUrl}">
      <input type="hidden" name="manifest" value="${manifestJson}">
    </form>
  </div>
  <script>document.getElementById("manifest-form").submit();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}

export async function handleSetupCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(
      JSON.stringify({ error: "missing_code", message: "code パラメータが必要です" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
    return new Response(
      JSON.stringify({ error: "invalid_code", message: "code パラメータが不正です" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const githubApiUrl = env.GITHUB_SERVER_URL
    ? `${env.GITHUB_SERVER_URL}/api/v3`
    : "https://api.github.com";

  let conversionRes: Response;
  try {
    conversionRes = await fetch(`${githubApiUrl}/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "upstream_error", message: "GitHub API への接続に失敗しました" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!conversionRes.ok) {
    return new Response(
      JSON.stringify({ error: "conversion_failed", message: "App 登録の変換に失敗しました" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  let appData: { id?: unknown; pem?: unknown; webhook_secret?: unknown };
  try {
    appData = (await conversionRes.json()) as {
      id?: unknown;
      pem?: unknown;
      webhook_secret?: unknown;
    };
  } catch {
    return new Response(
      JSON.stringify({ error: "parse_error", message: "GitHub API レスポンスの解析に失敗しました" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const appId = typeof appData.id === "number" ? appData.id : null;

  if (!appId) {
    return new Response(
      JSON.stringify({ error: "missing_app_id", message: "App ID の取得に失敗しました" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const githubServerUrl = env.GITHUB_SERVER_URL ?? "https://github.com";
  const installUrl = escapeHtml(`${githubServerUrl}/settings/installations/${appId}`);
  const appIdStr = escapeHtml(String(appId));

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chollows - セットアップ完了</title>
  <style>
    body { font-family: sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; background: #f6f8fa; }
    h1 { color: #1f2328; }
    h2 { color: #1f2328; margin-top: 2rem; }
    p { color: #57606a; line-height: 1.6; }
    pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 1rem; overflow-x: auto; font-size: 0.875rem; }
    .step { margin: 1rem 0; padding: 1rem; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; }
    .notice { background: #fff8c5; border: 1px solid #d4a72c; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
    a { color: #0969da; }
  </style>
</head>
<body>
  <h1>🏚️ Chollows — セットアップ完了</h1>
  <p>GitHub App の登録が完了しました。App ID: <strong>${appIdStr}</strong></p>

  <div class="notice">
    <strong>セキュリティに関するご案内</strong><br>
    セキュリティ上の理由から、秘密鍵と Webhook シークレットはここには表示しません。<br>
    GitHub App 設定画面から秘密鍵をダウンロードし、以下の手順で設定してください。
  </div>

  <h2>次のステップ</h2>

  <div class="step">
    <strong>1. シークレットを設定する</strong>
    <p>GitHub App 設定画面で秘密鍵（PEM ファイル）を生成・ダウンロードし、以下のコマンドで設定します:</p>
    <pre>wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put ANTHROPIC_API_KEY</pre>
  </div>

  <div class="step">
    <strong>2. App をリポジトリにインストールする</strong>
    <p><a href="${installUrl}" target="_blank" rel="noopener noreferrer">GitHub App インストールページ</a> からリポジトリに App をインストールしてください。</p>
  </div>

  <div class="step">
    <strong>3. PR のレビュアーに Chollows を追加する</strong>
    <p>PR を作成し、レビュアーに <strong>Chollows</strong> を指定するとレビューが始まります。</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}
