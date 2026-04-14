#!/bin/bash
set -euo pipefail

# ============================================================
# ScrewDriver 環境変数マッピング
# SCREWDRIVER=true の場合、SD 固有の変数を Chollows 形式に変換
# ============================================================
if [ "${SCREWDRIVER:-}" = "true" ]; then
  # PR 番号
  PR_NUMBER="${SD_PULL_REQUEST:-${PR_NUMBER:-}}"
  export PR_NUMBER

  # SCM_URL からホスト・リポジトリを抽出（SSH / HTTPS 両対応）
  if [ -n "${SCM_URL:-}" ] && [ -z "${GITHUB_REPOSITORY:-}" ]; then
    # SSH: git@github.example.com:owner/repo.git
    # HTTPS: https://github.example.com/owner/repo.git
    SCM_URL_CLEAN="${SCM_URL%.git}"
    if [[ "$SCM_URL_CLEAN" =~ ^git@ ]]; then
      # git@host:owner/repo
      GH_HOST_PART="${SCM_URL_CLEAN#git@}"
      GH_HOST_PART="${GH_HOST_PART%%:*}"
      GITHUB_REPOSITORY="${SCM_URL_CLEAN#*:}"
      GITHUB_SERVER_URL="https://${GH_HOST_PART}"
    elif [[ "$SCM_URL_CLEAN" =~ ^https?:// ]]; then
      # https://host/owner/repo
      GH_HOST_PART=$(echo "$SCM_URL_CLEAN" | sed -E 's|^https?://||' | sed 's|/.*||')
      GITHUB_REPOSITORY=$(echo "$SCM_URL_CLEAN" | sed -E 's|^https?://[^/]+/||')
      GITHUB_SERVER_URL="https://${GH_HOST_PART}"
    fi
    export GITHUB_REPOSITORY
    export GITHUB_SERVER_URL
  fi

  # SD の認証トークンをフォールバック
  GITHUB_TOKEN="${GITHUB_TOKEN:-${SCM_ACCESS_TOKEN:-}}"
  export GITHUB_TOKEN
fi

# ============================================================
# CI モード判定の統一（CHOLLOWS_CI）
# GHA / ScrewDriver 両方をカバー
# ============================================================
if [ -n "${GITHUB_ACTIONS:-}" ] || [ "${SCREWDRIVER:-}" = "true" ]; then
  export CHOLLOWS_CI=true
fi

# ============================================================
# 必須環境変数チェック
# ============================================================
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

# Bedrock モードでなければ ANTHROPIC_API_KEY が必須
if [ "${CLAUDE_CODE_USE_BEDROCK:-}" != "1" ]; then
  : "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required (or set CLAUDE_CODE_USE_BEDROCK=1)}"
fi

# ============================================================
# GHE ホスト解決
# ============================================================
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ "$GITHUB_SERVER_URL" != "https://github.com" ]; then
  GHE_HOST=$(echo "$GITHUB_SERVER_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  export GHE_HOST
  export GH_HOST="$GHE_HOST"
  export GH_ENTERPRISE_TOKEN="${GITHUB_TOKEN}"
  gh auth status --hostname "$GHE_HOST" 2>&1 || true
else
  gh auth status 2>&1 || true
fi

# ============================================================
# inputs 環境変数のデフォルト値設定
# ============================================================
MAX_BUDGET_USD="${MAX_BUDGET_USD:-5}"
MIN_SEVERITY="${MIN_SEVERITY:-medium}"
SKIP_LABELS="${SKIP_LABELS:-skip-chollows}"
DISABLED_AGENTS="${DISABLED_AGENTS:-}"
LANGUAGE="${LANGUAGE:-ja}"
REVIEW_INSTRUCTIONS="${REVIEW_INSTRUCTIONS:-}"
REVIEW_DRAFT="${REVIEW_DRAFT:-false}"
export MAX_BUDGET_USD
export MIN_SEVERITY
export SKIP_LABELS
export DISABLED_AGENTS
export LANGUAGE
export REVIEW_INSTRUCTIONS
export REVIEW_DRAFT

# ============================================================
# GenAI Proxy (Bedrock) モード
# ============================================================
if [ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ]; then
  : "${AWS_SESSION_TOKEN:?AWS_SESSION_TOKEN is required for Bedrock mode}"
  : "${ANTHROPIC_BEDROCK_BASE_URL:?ANTHROPIC_BEDROCK_BASE_URL is required for Bedrock mode}"
  export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-us.anthropic.claude-sonnet-4-6}"
fi

# ============================================================
# ワークスペース検出
# GitHub Actions: /github/workspace にマウント済み
# ScrewDriver: SD_SOURCE_DIR に clone 済み
# それ以外: gh repo clone する
# ============================================================
if [ -d "/github/workspace/.git" ]; then
  cd /github/workspace
elif [ -n "${SD_SOURCE_DIR:-}" ] && [ -d "${SD_SOURCE_DIR}/.git" ]; then
  cd "$SD_SOURCE_DIR"
else
  gh repo clone "$GITHUB_REPOSITORY" /workspace -- --depth=1
  cd /workspace
fi

# リポジトリ内 .chollows/ カスタムプラグイン検出（cd 後のカレントディレクトリを基準）
CHOLLOWS_PLUGIN_ARGS=()
if [ -d ".chollows/skills" ] || [ -d ".chollows/agents" ]; then
  CHOLLOWS_PLUGIN_ARGS=(--plugin-dir "$(pwd)/.chollows")
fi

# ============================================================
# Chollows レビュー実行
# root の場合は su で chollows ユーザーに切り替え
# ============================================================
CLAUDE_CMD=(claude -p "/chollows-review $PR_NUMBER" \
  --plugin-dir /chollows-plugin \
  "${CHOLLOWS_PLUGIN_ARGS[@]}" \
  --permission-mode bypassPermissions \
  --output-format text \
  --max-budget-usd "$MAX_BUDGET_USD")

if [ "$(id -u)" = "0" ]; then
  # root の場合、chollows ユーザーで実行（SD の setup ステップが root を必要とするため）
  chown -R chollows:chollows /chollows-plugin /workspace 2>/dev/null || true
  exec su chollows -c "$(printf '%q ' "${CLAUDE_CMD[@]}")"
else
  exec "${CLAUDE_CMD[@]}"
fi
