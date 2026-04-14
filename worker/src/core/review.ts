import { getContainer } from "@cloudflare/containers";
import type { Env } from "../types";
import type { ChollowsContainer } from "../infra";

export interface StartReviewOptions {
  prKey: string;
  prNumber: number;
  repositoryFullName: string;
  githubToken: string;
  webhookDeliveryId: string;
  env: Env;
  previousFindings?: string;
  reviewInstructions?: string;
  commentAuthor?: string;
}

function getPRReviewStub(prKey: string, env: Env): DurableObjectStub {
  const doId = env.PR_REVIEW.idFromName(prKey);
  return env.PR_REVIEW.get(doId);
}

function buildContainerId(prKey: string): string {
  // prKey: "owner/repo#123" → 安全な ID に変換
  return `review-${prKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

export async function startReview(options: StartReviewOptions): Promise<void> {
  const {
    prKey,
    prNumber,
    repositoryFullName,
    githubToken,
    webhookDeliveryId,
    env,
    previousFindings,
    reviewInstructions,
    commentAuthor,
  } = options;

  if (!githubToken) {
    throw new Error("startReview: githubToken is required");
  }
  if (!repositoryFullName) {
    throw new Error("startReview: repositoryFullName is required");
  }
  if (prNumber <= 0) {
    throw new Error(`startReview: invalid prNumber: ${prNumber}`);
  }

  const containerId = buildContainerId(prKey);
  const doStub = getPRReviewStub(prKey, env);

  // PRReviewDO に start を通知（cancel-in-progress も DO 内で処理される）
  const startResponse = await doStub.fetch(
    new Request("https://internal/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prKey, containerId, webhookDeliveryId }),
    })
  );

  if (!startResponse.ok) {
    const status = startResponse.status;
    console.error(`[container] PRReviewDO /start failed: HTTP ${status}`);
    throw new Error(`PRReviewDO start failed: HTTP ${status}`);
  }

  // Container スタブ取得
  const containerBinding = env.CONTAINER as DurableObjectNamespace<ChollowsContainer>;
  const containerStub = getContainer(containerBinding, containerId);

  // 環境変数を設定してコンテナを起動
  const minSeverity = env.MIN_SEVERITY || "medium";
  const maxBudgetUsd = env.MAX_BUDGET_USD || "5";
  const language = env.LANGUAGE || "ja";

  const envVars: Record<string, string> = {
    GITHUB_TOKEN: githubToken,
    GITHUB_REPOSITORY: repositoryFullName,
    PR_NUMBER: String(prNumber),
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    CHOLLOWS_CI: "true",
    MIN_SEVERITY: minSeverity,
    MAX_BUDGET_USD: maxBudgetUsd,
    LANGUAGE: language,
  };

  if (previousFindings) {
    envVars["PREVIOUS_FINDINGS"] = previousFindings;
  }
  if (reviewInstructions) {
    envVars["REVIEW_INSTRUCTIONS"] = reviewInstructions;
  }
  if (commentAuthor) {
    envVars["COMMENT_AUTHOR"] = commentAuthor;
  }

  try {
    // ChollowsContainer.fetch() が envVars を受け取り this.start({ envVars }) で Docker 環境変数として注入
    await containerStub.fetch(
      new Request("https://container/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVars }),
      })
    );
  } catch (err) {
    console.error(`[container] container fetch failed for ${containerId}: ${String(err)}`);
    // 起動失敗時は DO の状態を cancelled に戻す
    const cancelResponse = await doStub.fetch(
      new Request("https://internal/cancel", { method: "POST" })
    ).catch((cancelErr) => {
      console.error(`[container] PRReviewDO /cancel failed: ${String(cancelErr)}`);
      return null;
    });
    if (cancelResponse && !cancelResponse.ok) {
      console.error(`[container] PRReviewDO /cancel HTTP ${cancelResponse.status}`);
    }
    throw new Error(`Container start failed for ${containerId}: ${String(err)}`);
  }
}

export async function cancelReview(prKey: string, env: Env): Promise<void> {
  const doStub = getPRReviewStub(prKey, env);

  // 現在の state を取得して containerId を確認
  const getResponse = await doStub.fetch(
    new Request("https://internal/", { method: "GET" })
  );

  if (getResponse.status === 404) {
    // 既に state がない → 何もしない
    return;
  }

  if (!getResponse.ok) {
    console.error(`[container] PRReviewDO GET failed: HTTP ${getResponse.status}`);
    return;
  }

  // DO の状態を cancelled に更新
  const cancelResponse = await doStub.fetch(
    new Request("https://internal/cancel", { method: "POST" })
  );

  if (!cancelResponse.ok) {
    console.error(`[container] PRReviewDO /cancel failed: HTTP ${cancelResponse.status}`);
  }
}
