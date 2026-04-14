export const CHOLLOWS_DATA_MARKER = "<!-- chollows-data:v1 ";

/**
 * Installation Token で GitHub API を直接呼び出し、
 * PR の Issue コメントから chollows-data:v1 マーカーを含むコメントを探して
 * Base64 エンコード済み JSON 文字列を返す。見つからない場合は null。
 */
export async function fetchPreviousFindings(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  githubApiBase = "https://api.github.com"
): Promise<string | null> {
  // 最新のコメントから検索（chollows-data は最後に投稿される）
  const url = `${githubApiBase}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&direction=desc`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "chollows-worker/0.1.0",
      },
    });
  } catch (err) {
    console.error(`[webhook] fetchPreviousFindings: fetch error: ${String(err)}`);
    return null;
  }

  if (!response.ok) {
    console.error(`[webhook] fetchPreviousFindings: HTTP ${response.status}`);
    return null;
  }

  let comments: Array<{ body?: string }>;
  try {
    comments = (await response.json()) as Array<{ body?: string }>;
  } catch (err) {
    console.error(`[webhook] fetchPreviousFindings: JSON parse error: ${String(err)}`);
    return null;
  }

  for (const comment of comments) {
    const body = comment.body ?? "";
    const markerIndex = body.indexOf(CHOLLOWS_DATA_MARKER);
    if (markerIndex === -1) {
      continue;
    }
    const startIndex = markerIndex + CHOLLOWS_DATA_MARKER.length;
    const endIndex = body.indexOf(" -->", startIndex);
    if (endIndex === -1) {
      continue;
    }
    const b64 = body.slice(startIndex, endIndex).trim();
    if (b64.length > 0) {
      return b64;
    }
  }

  return null;
}
