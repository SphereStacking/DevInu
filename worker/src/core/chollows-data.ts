/**
 * chollows-data: PR コメントに埋め込む findings データの
 * Base64 エンコード/デコードユーティリティ。
 *
 * コメント形式:
 *   <!-- chollows-data:v1 <base64-encoded-json> -->
 *
 * JSON 構造:
 *   { version: "1", findings: Finding[] }
 */

export interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  title: string;
  description: string;
  confidence: number;
  suggestion?: string;
}

export interface ChollowsData {
  version: "1";
  findings: Finding[];
}

/**
 * ChollowsData オブジェクトを Base64 文字列にエンコードする。
 */
export function encodeChollowsData(data: ChollowsData): string {
  const json = JSON.stringify(data);
  // TextEncoder を使って UTF-8 バイト列に変換してから Base64 エンコード
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Base64 文字列をデコードして ChollowsData オブジェクトを返す。
 * 不正な入力（Base64 デコード失敗、JSON パース失敗、version 不一致）の場合は null を返す。
 */
export function decodeChollowsData(b64: string): ChollowsData | null {
  if (!b64 || b64.trim().length === 0) {
    return null;
  }

  let json: string;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    json = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>)["version"] !== "1" ||
    !Array.isArray((parsed as Record<string, unknown>)["findings"])
  ) {
    return null;
  }

  return parsed as ChollowsData;
}
