#!/bin/bash
set -euo pipefail

# 必須環境変数チェック
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

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

# DevInu レビュー実行
exec claude -p "/devinu-review $PR_NUMBER" \
  --plugin-dir /devinu-plugin \
  --permission-mode bypassPermissions \
  --output-format text \
  --max-budget-usd "${MAX_BUDGET_USD:-5}"
