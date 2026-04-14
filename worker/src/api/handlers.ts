import type { Env, GitHubWebhookPayload } from "../types";
import { getInstallationToken, fetchPreviousFindings, postErrorComment } from "../infra";
import { startReview, cancelReview } from "../core";
import type { StartReviewOptions } from "../core";
import { jsonResponse } from "../response";

interface ReviewContext {
  installationId: number;
  repositoryFullName: string;
  owner: string;
  repo: string;
  prKey: string;
  prNumber: number;
  githubToken: string;
}

async function resolveReviewContext(
  payload: GitHubWebhookPayload,
  prNumber: number,
  env: Env,
  logPrefix: string
): Promise<ReviewContext | Response> {
  const installationId = payload.installation?.id;
  if (!installationId) {
    console.error(`[webhook] ${logPrefix}: missing installation.id`);
    return jsonResponse({ error: "missing_installation_id" }, 400);
  }

  const repositoryFullName = payload.repository?.full_name;
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  if (!repositoryFullName || !owner || !repo) {
    console.error(`[webhook] ${logPrefix}: missing repository info`);
    return jsonResponse({ error: "missing_repository" }, 400);
  }

  const prKey = `${repositoryFullName}#${prNumber}`;

  let githubToken: string;
  try {
    githubToken = await getInstallationToken(installationId, env);
  } catch (err) {
    console.error(`[webhook] ${logPrefix}: getInstallationToken failed: ${String(err)}`);
    return jsonResponse({ error: "token_fetch_failed" }, 500);
  }

  return { installationId, repositoryFullName, owner, repo, prKey, prNumber, githubToken };
}

async function executeReview(
  ctx: ReviewContext,
  env: Env,
  deliveryId: string,
  extraOptions?: Partial<StartReviewOptions>
): Promise<Response> {
  try {
    await startReview({
      prKey: ctx.prKey,
      prNumber: ctx.prNumber,
      repositoryFullName: ctx.repositoryFullName,
      githubToken: ctx.githubToken,
      webhookDeliveryId: deliveryId,
      env,
      ...extraOptions,
    });
  } catch (err) {
    console.error(`[webhook] startReview failed for ${ctx.prKey}: ${String(err)}`);
    await postErrorComment(ctx.githubToken, ctx.owner, ctx.repo, ctx.prNumber, "レビューコンテナの起動に失敗しました。");
    return jsonResponse({ error: "container_start_failed" }, 500);
  }

  return jsonResponse({ ok: true, prKey: ctx.prKey });
}

export async function reviewRequestedHandler(
  payload: GitHubWebhookPayload,
  env: Env,
  deliveryId: string
): Promise<Response> {
  console.log("[webhook] pull_request.review_requested received");

  // requested_reviewer が Bot でなければ無視
  if (payload.requested_reviewer?.type !== "Bot") {
    return jsonResponse({ ok: true, skipped: "not_bot" });
  }

  const prNumber = payload.pull_request?.number;
  if (!prNumber) {
    console.error("[webhook] review_requested: missing pull_request.number");
    return jsonResponse({ error: "missing_pr_number" }, 400);
  }

  const result = await resolveReviewContext(payload, prNumber, env, "review_requested");
  if (result instanceof Response) {
    return result;
  }

  // Sticky コメントから前回の指摘データを取得（Re-request review 対応）
  const previousFindings = await fetchPreviousFindings(result.githubToken, result.owner, result.repo, prNumber);
  if (previousFindings) {
    console.log(`[webhook] review_requested: previousFindings found for ${result.prKey}`);
  }

  return executeReview(result, env, deliveryId, previousFindings ? { previousFindings } : {});
}

export async function issueCommentHandler(
  payload: GitHubWebhookPayload,
  env: Env,
  deliveryId: string
): Promise<Response> {
  console.log("[webhook] issue_comment.created received");

  // PR に紐づく Issue コメントのみ処理する
  if (!payload.issue?.pull_request) {
    return jsonResponse({ ok: true, skipped: "not_pr_comment" });
  }

  const commentBody = payload.comment?.body ?? "";
  const match = /^@chollows\s*([\s\S]*)/.exec(commentBody);
  if (!match) {
    return jsonResponse({ ok: true, skipped: "no_mention" });
  }

  const instructionText = (match[1] ?? "").trim();
  const prNumber = payload.issue.number;
  const commentAuthor = payload.comment?.user?.login ?? "";

  const result = await resolveReviewContext(payload, prNumber, env, "issue_comment");
  if (result instanceof Response) {
    return result;
  }

  return executeReview(result, env, deliveryId, {
    ...(instructionText ? { reviewInstructions: instructionText } : {}),
    ...(commentAuthor ? { commentAuthor } : {}),
  });
}

export async function prClosedHandler(
  payload: GitHubWebhookPayload,
  env: Env
): Promise<Response> {
  console.log("[webhook] pull_request.closed received");

  const prNumber = payload.pull_request?.number;
  const repositoryFullName = payload.repository?.full_name;

  if (!prNumber || !repositoryFullName) {
    // GitHub から想定外の構造が来た場合は無視して 200 を返す
    console.warn("[webhook] pull_request.closed: missing pr number or repository, skipping");
    return jsonResponse({ ok: true, skipped: "missing_fields" });
  }

  const prKey = `${repositoryFullName}#${prNumber}`;

  // 実行中コンテナがあればキャンセル
  await cancelReview(prKey, env).catch((err) => {
    console.error(`[webhook] prClosedHandler: cancelReview failed for ${prKey}: ${String(err)}`);
  });

  // PRReviewDO の state を全削除
  const doId = env.PR_REVIEW.idFromName(prKey);
  const doStub = env.PR_REVIEW.get(doId);

  const deleteResponse = await doStub.fetch(
    new Request("https://internal/", { method: "DELETE" })
  ).catch((err) => {
    console.error(`[webhook] PRReviewDO DELETE failed for ${prKey}: ${String(err)}`);
    return null;
  });

  if (deleteResponse && !deleteResponse.ok && deleteResponse.status !== 204) {
    console.error(`[webhook] PRReviewDO DELETE HTTP ${deleteResponse.status} for ${prKey}`);
  }

  return jsonResponse({ ok: true, prKey });
}
