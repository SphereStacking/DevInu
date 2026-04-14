import { describe, it, expect, vi, beforeEach } from "vitest";
import { postErrorComment } from "./error";

describe("postErrorComment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a comment with error marker to GitHub API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 201 })
    );
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment("ghs_test", "owner", "repo", 42, "テストエラーメッセージ");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/42/comments");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as { body: string };
    expect(body.body).toContain("<!-- chollows-error -->");
    expect(body.body).toContain("Chollows エラー通知");
    expect(body.body).toContain("テストエラーメッセージ");
    expect(body.body).toContain("Cloudflare Workers");
  });

  it("does not include token in the comment body", async () => {
    const token = "ghs_supersecrettoken";
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 201 })
    );
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment(token, "owner", "repo", 42, "何かが失敗しました");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { body: string };
    expect(body.body).not.toContain(token);
  });

  it("uses custom githubApiBase for GHE", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 201 })
    );
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment(
      "ghs_test",
      "owner",
      "repo",
      42,
      "エラー",
      "https://github.example.com/api/v3"
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://github.example.com/api/v3/repos/owner/repo/issues/42/comments");
  });

  it("does not throw when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(
      postErrorComment("ghs_test", "owner", "repo", 42, "エラー")
    ).resolves.toBeUndefined();
  });

  it("does not call fetch when token is empty", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment("", "owner", "repo", 42, "エラー");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not call fetch when prNumber is invalid", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment("ghs_test", "owner", "repo", 0, "エラー");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not call fetch when owner is empty", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await postErrorComment("ghs_test", "", "repo", 42, "エラー");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
