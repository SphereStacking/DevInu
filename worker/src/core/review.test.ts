import { describe, it, expect, vi, beforeEach } from "vitest";

// @cloudflare/containers は cloudflare:workers に依存するため Node 環境ではモックが必要
vi.mock("@cloudflare/containers", () => ({
  Container: class MockContainer {},
  getContainer: vi.fn(),
}));

import { getContainer } from "@cloudflare/containers";
import { startReview, cancelReview } from "./review";
import type { Env } from "../types";

const mockGetContainer = vi.mocked(getContainer);

function makePRReviewStub(
  startStatus: number,
  getStatus: number,
  cancelStatus: number,
  _deleteStatus: number
): DurableObjectStub {
  return {
    fetch: vi.fn().mockImplementation(async (req: Request) => {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/start") {
        return new Response(
          JSON.stringify({
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: new Date().toISOString(),
            webhookDeliveryId: "d-001",
          }),
          { status: startStatus }
        );
      }
      if (req.method === "GET" && url.pathname === "/") {
        if (getStatus === 404) {
          return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
        }
        return new Response(
          JSON.stringify({
            prKey: "owner/repo#42",
            containerId: "review-owner-repo-42",
            status: "running",
            startedAt: new Date().toISOString(),
            webhookDeliveryId: "d-001",
          }),
          { status: getStatus }
        );
      }
      if (req.method === "POST" && url.pathname === "/cancel") {
        return new Response(
          JSON.stringify({ status: "cancelled" }),
          { status: cancelStatus }
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }),
  } as unknown as DurableObjectStub;
}

function makeContainerStub(fetchStatus: number): DurableObjectStub {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: fetchStatus })
    ),
  } as unknown as DurableObjectStub;
}

function makeEnvWithDO(doStub: DurableObjectStub): Env {
  const makeNamespace = (stub: DurableObjectStub): DurableObjectNamespace => ({
    idFromName: (_name: string) => ({ toString: () => _name }) as DurableObjectId,
    get: (_id: DurableObjectId) => stub,
    newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
    idFromString: (s: string) => ({ toString: () => s }) as DurableObjectId,
    jurisdiction: undefined,
  } as unknown as DurableObjectNamespace);

  return {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: "",
    GITHUB_WEBHOOK_SECRET: "secret",
    ANTHROPIC_API_KEY: "sk-test",
    PR_REVIEW: makeNamespace(doStub),
    TOKEN_CACHE: {} as DurableObjectNamespace,
    CONTAINER: {} as DurableObjectNamespace,
    MIN_SEVERITY: "medium",
    MAX_BUDGET_USD: "5",
    LANGUAGE: "ja",
  } as unknown as Env;
}

describe("startReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PRReviewDO /start then container fetch", async () => {
    const doStub = makePRReviewStub(201, 200, 200, 204);
    const containerStub = makeContainerStub(200);
    mockGetContainer.mockReturnValue(containerStub as ReturnType<typeof getContainer>);

    const env = makeEnvWithDO(doStub);

    await startReview({
      prKey: "owner/repo#42",
      prNumber: 42,
      repositoryFullName: "owner/repo",
      githubToken: "ghs_test",
      webhookDeliveryId: "d-001",
      env,
    });

    const doFetch = doStub.fetch as ReturnType<typeof vi.fn>;
    expect(doFetch).toHaveBeenCalledOnce();
    const firstCall = doFetch.mock.calls[0] as [Request];
    expect(new URL(firstCall[0].url).pathname).toBe("/start");

    const containerFetch = containerStub.fetch as ReturnType<typeof vi.fn>;
    expect(containerFetch).toHaveBeenCalledOnce();
  });

  it("throws when githubToken is empty", async () => {
    const doStub = makePRReviewStub(201, 200, 200, 204);
    const env = makeEnvWithDO(doStub);

    await expect(
      startReview({
        prKey: "owner/repo#42",
        prNumber: 42,
        repositoryFullName: "owner/repo",
        githubToken: "",
        webhookDeliveryId: "d-001",
        env,
      })
    ).rejects.toThrow("githubToken is required");
  });

  it("throws when prNumber is invalid", async () => {
    const doStub = makePRReviewStub(201, 200, 200, 204);
    const env = makeEnvWithDO(doStub);

    await expect(
      startReview({
        prKey: "owner/repo#0",
        prNumber: 0,
        repositoryFullName: "owner/repo",
        githubToken: "ghs_test",
        webhookDeliveryId: "d-001",
        env,
      })
    ).rejects.toThrow("invalid prNumber");
  });

  it("cancels DO state when container fetch fails", async () => {
    const doStub = makePRReviewStub(201, 200, 200, 204);
    const failingContainerStub = {
      fetch: vi.fn().mockRejectedValue(new Error("container unreachable")),
    } as unknown as DurableObjectStub;
    mockGetContainer.mockReturnValue(failingContainerStub as ReturnType<typeof getContainer>);

    const env = makeEnvWithDO(doStub);

    await expect(
      startReview({
        prKey: "owner/repo#42",
        prNumber: 42,
        repositoryFullName: "owner/repo",
        githubToken: "ghs_test",
        webhookDeliveryId: "d-001",
        env,
      })
    ).rejects.toThrow("Container start failed");

    // /cancel が呼ばれたことを確認
    const doFetch = doStub.fetch as ReturnType<typeof vi.fn>;
    const calls = doFetch.mock.calls as Array<[Request]>;
    const cancelCall = calls.find((c) => new URL(c[0].url).pathname === "/cancel");
    expect(cancelCall).toBeDefined();
  });
});

describe("cancelReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends /cancel to PRReviewDO when state exists", async () => {
    const doStub = makePRReviewStub(201, 200, 200, 204);
    const env = makeEnvWithDO(doStub);

    await cancelReview("owner/repo#42", env);

    const doFetch = doStub.fetch as ReturnType<typeof vi.fn>;
    const calls = doFetch.mock.calls as Array<[Request]>;
    const cancelCall = calls.find((c) => new URL(c[0].url).pathname === "/cancel");
    expect(cancelCall).toBeDefined();
  });

  it("does nothing when state is not found", async () => {
    const doStub = makePRReviewStub(201, 404, 200, 204);
    const env = makeEnvWithDO(doStub);

    await cancelReview("owner/repo#42", env);

    const doFetch = doStub.fetch as ReturnType<typeof vi.fn>;
    const calls = doFetch.mock.calls as Array<[Request]>;
    const cancelCall = calls.find((c) => new URL(c[0].url).pathname === "/cancel");
    expect(cancelCall).toBeUndefined();
  });
});
