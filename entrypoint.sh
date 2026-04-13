#!/bin/bash
set -euo pipefail

# 必須環境変数チェック
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

# GHE ホスト解決（GITHUB_SERVER_URL がカスタムの場合）
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ "$GITHUB_SERVER_URL" != "https://github.com" ]; then
  GHE_HOST=$(echo "$GITHUB_SERVER_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  export GHE_HOST
  GH_HOSTNAME_ARGS="--hostname $GHE_HOST"
else
  GHE_HOST=""
  GH_HOSTNAME_ARGS=""
fi
export GH_HOSTNAME_ARGS

# inputs 環境変数のデフォルト値設定
MAX_BUDGET_USD="${MAX_BUDGET_USD:-5}"
MIN_SEVERITY="${MIN_SEVERITY:-medium}"
SKIP_LABELS="${SKIP_LABELS:-skip-chollows}"
DISABLED_AGENTS="${DISABLED_AGENTS:-}"
LANGUAGE="${LANGUAGE:-ja}"
REVIEW_INSTRUCTIONS="${REVIEW_INSTRUCTIONS:-}"
export MAX_BUDGET_USD
export MIN_SEVERITY
export SKIP_LABELS
export DISABLED_AGENTS
export LANGUAGE
export REVIEW_INSTRUCTIONS

# GitHub 認証
# GITHUB_TOKEN 環境変数が設定されている場合、gh CLI は自動で認証するため
# gh auth login は不要。gh auth status で確認のみ行う。
gh auth status 2>&1 || true

# GitHub Actions の場合、リポジトリは /github/workspace にマウント済み
# それ以外の場合は clone する
if [ -d "/github/workspace/.git" ]; then
  cd /github/workspace
else
  gh repo clone "$GITHUB_REPOSITORY" /workspace -- --depth=1
  cd /workspace
fi

# リポジトリ内 .chollows/ カスタムプラグイン検出（cd 後のカレントディレクトリを基準）
CHOLLOWS_PLUGIN_ARGS=()
if [ -d ".chollows/skills" ] || [ -d ".chollows/agents" ]; then
  CHOLLOWS_PLUGIN_ARGS=(--plugin-dir "$(pwd)/.chollows")
fi

# Chollows レビュー実行
exec claude -p "/chollows-review $PR_NUMBER" \
  --plugin-dir /chollows-plugin \
  "${CHOLLOWS_PLUGIN_ARGS[@]}" \
  --permission-mode bypassPermissions \
  --output-format text \
  --max-budget-usd "$MAX_BUDGET_USD"
