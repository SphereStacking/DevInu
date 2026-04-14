import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubWebhookPayload } from "../types";
import { signBody, makeSignedRequest, makeEnv, BASE_REPO, BASE_INSTALLATION } from "../../test/helpers";

const { mockStartReview, mockCancelReview, mockPostErrorComment, mockGetInstallationToken } =
  vi.hoisted(() => ({
    mockStartReview: vi.fn().mockResolvedValue(undefined),
    mockCancelReview: vi.fn().mockResolvedValue(undefined),
    mockPostErrorComment: vi.fn().mockResolvedValue(undefined),
    mockGetInstallationToken: vi.fn().mockResolvedValue("ghs_test_token"),
  }));

vi.mock("@cloudflare/containers", () => ({
  Container: class MockContainer {},
  getContainer: vi.fn(),
}));

vi.mock("../infra/auth", () => ({
  getInstallationToken: mockGetInstallationToken,
}));

vi.mock("../core/review", () => ({
  startReview: mockStartReview,
  cancelReview: mockCancelReview,
}));

vi.mock("../infra/container", () => ({
  ChollowsContainer: class MockChollowsContainer {},
}));

vi.mock("../infra/error", () => ({
  postErrorComment: mockPostErrorComment,
}));

import { handleWebhook } from "./webhook";

const WEBHOOK_SECRET = "test-webhook-secret";

function envWithSecret() {
  return makeEnv({
    GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PR_REVIEW: {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: async (req: Request) => {
          const url = new URL(req.url);
          if (req.method === "DELETE" && url.pathname === "/") {
            return new Response(null, { status: 204 });
          }
          return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
        },
      }),
    } as unknown as DurableObjectNamespace,
  });
}

async function makeRequest(payload: GitHubWebhookPayload, event: string): Promise<Request> {
  return makeSignedRequest(payload, event, WEBHOOK_SECRET);
}

// --- issueCommentHandler tests ---

describe("issueCommentHandler via handleWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when issue is not a PR (no pull_request field)", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 1 },
      comment: { body: "@chollows security を確認して", user: { login: "user1" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { ok: boolean; skipped: string };

    expect(res.status).toBe(200);
    expect(json.skipped).toBe("not_pr_comment");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("skips when comment does not start with @chollows", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 5, pull_request: {} },
      comment: { body: "LGTM！", user: { login: "user1" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { ok: boolean; skipped: string };

    expect(res.status).toBe(200);
    expect(json.skipped).toBe("no_mention");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("starts review with reviewInstructions and commentAuthor", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 10, pull_request: {} },
      comment: { body: "@chollows security を確認して", user: { login: "reviewer" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockStartReview).toHaveBeenCalledOnce();

    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.reviewInstructions).toBe("security を確認して");
    expect(callArg?.commentAuthor).toBe("reviewer");
    expect(callArg?.targetAgents).toBeUndefined();
  });

  it("starts review without reviewInstructions for bare @chollows", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 14, pull_request: {} },
      comment: { body: "@chollows", user: { login: "reviewer" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.reviewInstructions).toBeUndefined();
  });

  it("returns 400 when repository info is missing", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 20, pull_request: {} },
      comment: { body: "@chollows security", user: { login: "u" } },
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe("missing_repository");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("returns 400 when installation.id is missing", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      issue: { number: 21, pull_request: {} },
      comment: { body: "@chollows security", user: { login: "u" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe("missing_installation_id");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("sets reviewInstructions to full instruction text", async () => {
    const instructionText = "このPRのセキュリティとAPIを詳しく確認してください。";
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 30, pull_request: {} },
      comment: { body: `@chollows ${instructionText}`, user: { login: "reviewer" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    await handleWebhook(req, envWithSecret());

    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.reviewInstructions).toBe(instructionText);
  });
});

// --- github-api (previousFindings) tests ---

describe("reviewRequestedHandler with previousFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes previousFindings when chollows-data comment exists", async () => {
    const b64Data = "eyJ2ZXJzaW9uIjoiMSIsImZpbmRpbmdzIjpbXX0=";
    const stickyBody = `<!-- chollows-review-v1 -->\n## Chollows\n<!-- chollows-data:v1 ${b64Data} -->`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/issues/50/comments")) {
          return new Response(JSON.stringify([{ body: stickyBody }]), { status: 200 });
        }
        return new Response(null, { status: 200 });
      })
    );

    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 50, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());
    const json = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockStartReview).toHaveBeenCalledOnce();

    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.previousFindings).toBe(b64Data);
  });

  it("proceeds without previousFindings when no chollows-data comment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/issues/51/comments")) {
          return new Response(JSON.stringify([{ body: "普通のコメント" }]), { status: 200 });
        }
        return new Response(null, { status: 200 });
      })
    );

    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 51, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(200);
    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.previousFindings).toBeUndefined();
  });

  it("proceeds without previousFindings when comments API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/issues/52/comments")) {
          return new Response(JSON.stringify({ message: "Server Error" }), { status: 500 });
        }
        return new Response(null, { status: 200 });
      })
    );

    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 52, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    // previousFindings なしで続行（フォールバック）
    expect(res.status).toBe(200);
    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.previousFindings).toBeUndefined();
  });
});

// --- edge cases ---

describe("edge case: force push 後の Re-request review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ body: "普通のコメント" }]), { status: 200 })
      )
    );
  });

  it("force push 後の Re-request (synchronize イベント後の review_requested) → startReview を呼ぶ", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 100, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(200);
    expect(mockStartReview).toHaveBeenCalledOnce();
    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.prKey).toBe("owner/repo#100");
  });
});

describe("edge case: PR reopen 後のレビュアー指定（state なし → 初回扱い）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      )
    );
  });

  it("PR reopen 後に review_requested → previousFindings なしで startReview を呼ぶ", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 200, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(200);
    expect(mockStartReview).toHaveBeenCalledOnce();
    const callArg = mockStartReview.mock.calls[0]?.[0];
    expect(callArg?.previousFindings).toBeUndefined();
  });
});

describe("edge case: 同一 PR への連続 Re-request（cancel-in-progress は PRReviewDO 内部で処理）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      )
    );
  });

  it("2 回目の review_requested でも startReview を呼ぶ（DO 内部でキャンセル処理）", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 300, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const env = envWithSecret();

    // 1 回目
    const req1 = await makeRequest(payload, "pull_request");
    const res1 = await handleWebhook(req1, env);
    expect(res1.status).toBe(200);

    // 2 回目（連続）
    const req2 = await makeRequest(payload, "pull_request");
    const res2 = await handleWebhook(req2, env);
    expect(res2.status).toBe(200);

    expect(mockStartReview).toHaveBeenCalledTimes(2);
  });
});

describe("edge case: @chollows コメントが Issue（PR でない）に投稿された場合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Issue コメントの @chollows → not_pr_comment としてスキップ（startReview 未呼び出し）", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 400 },
      comment: { body: "@chollows security を確認して", user: { login: "user1" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; skipped: string };
    expect(json.skipped).toBe("not_pr_comment");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("Issue コメントの @chollows → getInstallationToken も呼ばれない", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 401 },
      comment: { body: "@chollows レビューして", user: { login: "user1" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    await handleWebhook(req, envWithSecret());

    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });
});

describe("edge case: Installation Token 取得失敗時のエラーコメント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInstallationToken.mockRejectedValue(new Error("Failed to get installation token: HTTP 403"));
  });

  it("review_requested でトークン取得失敗 → 500 を返し startReview を呼ばない", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 500, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("token_fetch_failed");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("issue_comment でトークン取得失敗 → 500 を返し startReview を呼ばない", async () => {
    const payload: GitHubWebhookPayload = {
      action: "created",
      installation: BASE_INSTALLATION,
      issue: { number: 501, pull_request: {} },
      comment: { body: "@chollows security を確認して", user: { login: "user1" } },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "issue_comment");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("token_fetch_failed");
    expect(mockStartReview).not.toHaveBeenCalled();
  });

  it("review_requested でトークン取得失敗 → postErrorComment は呼ばれない（token が取れていないため）", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 502, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    await handleWebhook(req, envWithSecret());

    expect(mockPostErrorComment).not.toHaveBeenCalled();
  });
});

describe("edge case: startReview 失敗時のエラーコメント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInstallationToken.mockResolvedValue("ghs_test_token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      )
    );
    mockStartReview.mockRejectedValue(new Error("Container start failed"));
  });

  it("startReview 失敗時 → 500 を返し postErrorComment を呼ぶ", async () => {
    const payload: GitHubWebhookPayload = {
      action: "review_requested",
      installation: BASE_INSTALLATION,
      pull_request: { number: 600, draft: false },
      requested_reviewer: { login: "chollows[bot]", type: "Bot" },
      repository: BASE_REPO,
    };

    const req = await makeRequest(payload, "pull_request");
    const res = await handleWebhook(req, envWithSecret());

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("container_start_failed");
    expect(mockPostErrorComment).toHaveBeenCalledOnce();
    const callArgs = mockPostErrorComment.mock.calls[0];
    expect(callArgs?.[0]).toBe("ghs_test_token");
    expect(callArgs?.[1]).toBe("owner");
    expect(callArgs?.[2]).toBe("repo");
    expect(callArgs?.[3]).toBe(600);
  });
});
