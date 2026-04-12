#!/bin/bash
set -euo pipefail

# 必須環境変数チェック
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

# GitHub 認証
echo "$GITHUB_TOKEN" | gh auth login --with-token

# リポジトリ clone（shallow clone でサイズ節約）
gh repo clone "$GITHUB_REPOSITORY" /workspace -- --depth=1
cd /workspace

# DevInu レビュー実行
exec claude -p "/devinu-review $PR_NUMBER" \
  --plugin-dir /devinu-plugin \
  --permission-mode bypassPermissions \
  --output-format text \
  --max-budget-usd "${MAX_BUDGET_USD:-5}"
