#!/bin/bash

# 必須環境変数チェック
if [ -z "$GITHUB_TOKEN" ]; then echo "ERROR: GITHUB_TOKEN is required" >&2; exit 1; fi
if [ -z "$ANTHROPIC_API_KEY" ]; then echo "ERROR: ANTHROPIC_API_KEY is required" >&2; exit 1; fi
if [ -z "$GITHUB_REPOSITORY" ]; then echo "ERROR: GITHUB_REPOSITORY is required" >&2; exit 1; fi
if [ -z "$PR_NUMBER" ]; then echo "ERROR: PR_NUMBER is required" >&2; exit 1; fi

echo "=== DevInu entrypoint ==="
echo "HOME=$HOME"
echo "GITHUB_REPOSITORY=$GITHUB_REPOSITORY"
echo "PR_NUMBER=$PR_NUMBER"

# GitHub 認証
echo "Authenticating with gh..."
echo "$GITHUB_TOKEN" | gh auth login --with-token 2>&1
echo "gh auth status: $?"

# ワークスペース
if [ -d "/github/workspace/.git" ]; then
  echo "Using mounted workspace"
  cd /github/workspace
else
  echo "Cloning repository..."
  gh repo clone "$GITHUB_REPOSITORY" /workspace -- --depth=1
  cd /workspace
fi

echo "Working directory: $(pwd)"
echo "Plugin dir contents:"
ls -la /devinu-plugin/.claude-plugin/ 2>&1 || echo "Plugin dir not found"

echo "Starting claude..."
claude -p "/devinu-review $PR_NUMBER" \
  --plugin-dir /devinu-plugin \
  --permission-mode bypassPermissions \
  --output-format text \
  --max-budget-usd "${MAX_BUDGET_USD:-5}" 2>&1
EXIT_CODE=$?
echo "Claude exit code: $EXIT_CODE"
exit $EXIT_CODE
