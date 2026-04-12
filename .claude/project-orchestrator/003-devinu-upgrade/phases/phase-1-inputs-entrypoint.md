# フェーズ 1: action.yml inputs + entrypoint.sh 強化

**目的:** action.yml に inputs（`max_budget_usd`, `min_severity`, `enable_ci_analysis`, `skip_labels`）を追加し、entrypoint.sh で GHE 対応・環境変数受け渡しを強化する。後続フェーズ（Sticky コメント、インラインコメント、ちくわ）の基盤となる。

**ステータス:** 完了
**前提条件:** フェーズ 0 完了（action.yml が GHCR 参照に変更済み）

**リスクレベル:** 中
**ロールバック:** action.yml の inputs セクションを削除し entrypoint.sh を git checkout で復元

---

## タスク

### 1-1: action.yml に inputs セクション追加 (Critical)

**ファイル:** `action.yml`（変更）
**現状:** inputs セクションなし
**目標:** 設計書 §7.2 に定義された 4 つの inputs が存在し、`runs.env` で環境変数として渡される
**備考:** 追加する inputs:
```yaml
inputs:
  max_budget_usd:
    description: "Claude Code 実行のコスト上限（USD）"
    default: "5"
  min_severity:
    description: "レポートする最低 severity（critical/high/medium/low）"
    default: "medium"
  enable_ci_analysis:
    description: "CI 失敗ログ分析を有効化するか（ちくわ起動）"
    default: "false"
  skip_labels:
    description: "スキップするラベル（カンマ区切り）"
    default: "skip-devinu"
```
`runs.env` に以下を追加:
```yaml
env:
  MAX_BUDGET_USD: ${{ inputs.max_budget_usd }}
  MIN_SEVERITY: ${{ inputs.min_severity }}
  ENABLE_CI_ANALYSIS: ${{ inputs.enable_ci_analysis }}
  SKIP_LABELS: ${{ inputs.skip_labels }}
```

### 1-2: entrypoint.sh に GHE ホスト解決ロジック追加 (Critical)

**ファイル:** `entrypoint.sh`（変更）
**現状:** GHE 対応なし
**目標:** `GITHUB_SERVER_URL` が `https://github.com` 以外の場合、`GHE_HOST` と `GH_HOSTNAME_ARGS` を export する
**備考:** 設計書 §7.2, §8.5 の実装:
```bash
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ "$GITHUB_SERVER_URL" != "https://github.com" ]; then
  GHE_HOST=$(echo "$GITHUB_SERVER_URL" | sed 's|https://||' | sed 's|/||g')
  export GHE_HOST
  GH_HOSTNAME_ARGS="--hostname $GHE_HOST"
else
  GHE_HOST=""
  GH_HOSTNAME_ARGS=""
fi
export GH_HOSTNAME_ARGS
```

### 1-3: entrypoint.sh の MAX_BUDGET_USD デフォルト値とコマンドライン引数更新 (High)

**ファイル:** `entrypoint.sh`（変更）
**現状:** MAX_BUDGET_USD のデフォルト値処理が不完全、または固定値
**目標:** `MAX_BUDGET_USD="${MAX_BUDGET_USD:-5}"` でデフォルト値を設定し、`claude` コマンドの `--max-budget-usd` 引数に渡す
**備考:** `exec claude -p "/devinu-review $PR_NUMBER" --plugin-dir /devinu-plugin --permission-mode bypassPermissions --output-format text --max-budget-usd "$MAX_BUDGET_USD"`

### 1-4: entrypoint.sh に新規環境変数の export 追加 (High)

**ファイル:** `entrypoint.sh`（変更）
**現状:** MIN_SEVERITY, ENABLE_CI_ANALYSIS, SKIP_LABELS を Claude Code プロセスに渡していない
**目標:** これらの環境変数がデフォルト値付きで export され、おやかた（SKILL.md）から参照可能
**備考:**
```bash
MIN_SEVERITY="${MIN_SEVERITY:-medium}"
ENABLE_CI_ANALYSIS="${ENABLE_CI_ANALYSIS:-false}"
SKIP_LABELS="${SKIP_LABELS:-skip-devinu}"
export MIN_SEVERITY ENABLE_CI_ANALYSIS SKIP_LABELS
```

### 1-5: example-devinu.yml に inputs 設定例を追加 (Medium)

**ファイル:** `.github/workflows/example-devinu.yml`（変更）
**現状:** inputs の設定例なし
**目標:** 利用者が参考にできる inputs 設定例（コメント付き）が存在する
**備考:** `with:` セクションでのカスタマイズ例をコメントで記載

### 1-6: example-devinu.yml に actions: read 権限追加 (High)

**ファイル:** `.github/workflows/example-devinu.yml`（変更）
**現状:** `permissions` に `actions: read` がない
**目標:** CI ログ取得（`gh run view`）に必要な `actions: read` 権限が追加されている
**備考:** 設計書 §9.2 に基づく。ちくわの CI 分析機能で必要。

---

## 検証ステップ

```bash
# action.yml の YAML 構文と inputs 存在確認
python3 -c "
import yaml
with open('action.yml') as f:
    data = yaml.safe_load(f)
assert 'inputs' in data, 'inputs missing'
required = ['max_budget_usd', 'min_severity', 'enable_ci_analysis', 'skip_labels']
for key in required:
    assert key in data['inputs'], f'{key} missing from inputs'
print('action.yml inputs OK')
"

# entrypoint.sh の shellcheck
shellcheck entrypoint.sh || echo "shellcheck warnings (review manually)"

# GHE_HOST ロジックの存在確認
grep 'GHE_HOST' entrypoint.sh && echo "GHE logic OK"
grep 'GH_HOSTNAME_ARGS' entrypoint.sh && echo "GH_HOSTNAME_ARGS OK"

# 環境変数 export の確認
grep 'export MIN_SEVERITY' entrypoint.sh && echo "MIN_SEVERITY export OK"
grep 'export ENABLE_CI_ANALYSIS' entrypoint.sh && echo "ENABLE_CI_ANALYSIS export OK"

# Docker ビルド確認（entrypoint.sh の変更が破壊的でないか）
docker build -t devinu-test . && echo "Docker build OK"
```

---

## 完了条件

- [ ] `action.yml` に 4 つの inputs が定義されている（`max_budget_usd`, `min_severity`, `enable_ci_analysis`, `skip_labels`）
- [ ] `action.yml` の `runs.env` で inputs が環境変数として渡されている
- [ ] `entrypoint.sh` に GHE ホスト解決ロジックが存在する
- [ ] `entrypoint.sh` で `MAX_BUDGET_USD`, `MIN_SEVERITY`, `ENABLE_CI_ANALYSIS`, `SKIP_LABELS` にデフォルト値が設定されている
- [ ] `entrypoint.sh` の `claude` コマンドに `--max-budget-usd` が渡されている
- [ ] `example-devinu.yml` に `actions: read` 権限が追加されている
- [ ] Docker イメージがビルド可能

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| action.yml に 4 inputs 存在 | Python スクリプトで検証 | ✅ |
| runs.env で環境変数マッピング | action.yml の env セクション確認 | ✅ |
| GHE_HOST 解決ロジック存在 | `grep GHE_HOST entrypoint.sh` | ✅ |
| shellcheck でエラーなし | `shellcheck entrypoint.sh` 終了コード 0 | ⚠️ 推奨 |
| Docker ビルド成功 | `docker build` 成功 | ✅ |
| actions: read 権限追加 | `grep 'actions: read' example-devinu.yml` | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（pr-review-toolkit or feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff`）
**フォーカス:** Bash スクリプトの安全性、YAML 構文、環境変数の受け渡し

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> GitHub Actions と Bash スクリプトの専門家として、フェーズ 1 の変更をレビューせよ:
> - action.yml の inputs 定義は GitHub Actions の仕様に準拠しているか？（required, default, description の使い方）
> - `runs.env` での環境変数マッピングは正しいか？（`${{ inputs.xxx }}` 記法）
> - entrypoint.sh の GHE_HOST 解決ロジックはエッジケース（URL 末尾のスラッシュ、ポート番号等）を正しく処理するか？
> - `--max-budget-usd` 引数はスペースを含む値を渡していないか？
> - `exec claude` の引数順序と組み合わせに問題はないか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 1 のリグレッションと不足を批判的にレビューせよ:
> - 既存の entrypoint.sh の機能（環境変数チェック、gh auth 等）が破壊されていないか？
> - action.yml の既存の `runs` 設定（using, image）がフェーズ 0 の変更と整合しているか？
> - 新規環境変数（MIN_SEVERITY 等）がおやかた（SKILL.md）で参照可能であることを確認。SKILL.md 側の変更は不要か？
> - SKIP_LABELS のカンマ区切り値が Bash で正しく処理されるか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** `GHE_HOST`, `GH_HOSTNAME_ARGS`, `MIN_SEVERITY`, `ENABLE_CI_ANALYSIS`, `SKIP_LABELS` が環境変数として Claude Code プロセス内から参照可能。おやかた（SKILL.md）はこれらを使ってレビュー動作をカスタマイズする。
- **設計判断の背景:** inputs は action.yml → runs.env → entrypoint.sh → export の流れで Claude Code プロセスに渡る。この間接参照が必要な理由は Docker action の仕様上の制約。
- **既知の制限事項:** おやかた（SKILL.md）側の対応はフェーズ 2 以降で行う。フェーズ 1 時点では環境変数が設定されるだけで、参照はされない。
- **共有ユーティリティ:** `GH_HOSTNAME_ARGS` はフェーズ 2〜4 の全 `gh api` 呼び出しで共通使用される。
