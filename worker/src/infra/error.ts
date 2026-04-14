const ERROR_MARKER = "<!-- chollows-error -->";

export async function postErrorComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  message: string,
  githubApiBase = "https://api.github.com"
): Promise<void> {
  if (!token) {
    console.error("[error] postErrorComment called with empty token");
    return;
  }
  if (!owner || !repo) {
    console.error("[error] postErrorComment called with empty owner or repo");
    return;
  }
  if (prNumber <= 0) {
    console.error(`[error] postErrorComment called with invalid prNumber: ${prNumber}`);
    return;
  }

  const body =
    `${ERROR_MARKER}\n` +
    `🏚️ **Chollows エラー通知**\n\n` +
    `${message}\n\n` +
    `---\n` +
    `*詳細は Cloudflare Workers のログを確認してください*`;

  const url = `${githubApiBase}/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "chollows-worker/0.1.0",
      },
      body: JSON.stringify({ body }),
    });
  } catch (err) {
    console.error(`[error] postErrorComment fetch failed: ${String(err)}`);
    return;
  }

  if (!response.ok) {
    console.error(`[error] postErrorComment HTTP ${response.status} for ${owner}/${repo}#${prNumber}`);
  }
}
