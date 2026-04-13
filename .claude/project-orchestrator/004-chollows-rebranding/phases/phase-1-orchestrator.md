# フェーズ 1: Orchestrator SKILL.md

**目的:** chollows-review SKILL.md（オーケストレーター）を全面再設計する。PR 情報収集・スキップ判定・6 agent 並列起動・結果統合（Confidence/severity フィルタ）・Claude summary 生成・Sticky コメント投稿・再レビュー修正判定の全フローを実装する。

**ステータス:** 未開始
**前提条件:** フェーズ 0 完了（`plugins/chollows/skills/chollows-review/SKILL.md` のパスが確定していること）

**リスクレベル:** 高
**ロールバック:** `git checkout plugins/chollows/skills/chollows-review/SKILL.md` で元に戻す。

---

## タスク

### 1-1: SKILL.md ヘッダーと基本構造 (Critical)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** フェーズ 0 で作成されたプレースホルダ
**目標:** SKILL.md のヘッダー（名前、説明、引数定義）と全体構造を設計書セクション5のインターフェース定義に基づいて記述。
**備考:** 既存の `plugins/devinu/skills/devinu-review/SKILL.md` を参考にしつつ、Chollows の設計に合わせて全面再設計。`$ARGUMENTS` で PR 番号を受け取る。

### 1-2: PR 情報収集とスキップ判定 (Critical)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** 設計書セクション6 UC-01 のステップ1〜3を実装。gh CLI でPR情報取得（title/body/labels/isDraft/files/headRefOid/diff）、Draft PR とスキップラベルの判定。PR 番号のバリデーション（数値チェック）。
**備考:** 設計書セクション3の gh コマンド一覧に従う。`SKIP_LABELS` は環境変数から取得（カンマ区切り）。

### 1-3: Sticky コメント管理 (Critical)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** `<!-- chollows-review-v1 -->` マーカーによる Sticky コメントの作成/更新ロジック。レビュー開始時に「レビュー中...」を投稿し、完了後に結果で上書き。既存コメントの検索と COMMENT_ID の取得。
**備考:** CI モード（`GITHUB_ACTIONS` 環境変数あり）の場合のみコメント投稿。ローカルはターミナル出力。

### 1-4: 6 agent 並列起動 (Critical)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** 6匹の agent（shokupan/damuo/fuwafuwa/yuki/togetoge/piko）を1メッセージで並列起動する指示を記述。各 agent に渡す情報（diff、ファイル一覧、rules.md コンテキスト、disabled_agents）を定義。`DISABLED_AGENTS` に含まれる agent は起動しない（SKILL.md 側でスキップ）。
**備考:** `.chollows/rules.md` が存在する場合は読み込んでコンテキストに含める。優先順序: CLAUDE.md → .chollows/rules.md → デフォルト（REQ-026, M-001）。

### 1-5: 結果統合とフィルタ (Critical)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** 全 agent の結果を統合し、以下の処理を行う指示:
- Confidence ≥ 80 AND severity ≥ min_severity でフィルタ（REQ-007）
- 同一 file:line の重複排除
- severity 降順ソート（Critical → High → Medium → Low）
- diff position マップ構築（インラインコメント用）
**備考:** `MIN_SEVERITY` 環境変数を参照。不正値は `medium` にフォールバック。

### 1-6: 再レビュー時の修正済み判定 (High)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** 設計書セクション6 UC-04 のロジックを実装。既存 Sticky コメントから前回指摘を抽出し、file:line が今回の diff に含まれていれば「修正済み」マーク（取り消し線 + `→ **修正済み**`）（REQ-015, REQ-016, M-002）。
**備考:** 前回すでに取り消し線の指摘はそのまま維持。

### 1-7: Claude summary と PR ディスクリプションレビュー (High)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** Sticky コメントの最後のセクションとして Claude summary を生成。統合サマリー（重大指摘数、軽微指摘数、総合判定）と PR ディスクリプションレビュー（本文 3 行未満または 100 文字未満の場合にドラフト提案）を含む（REQ-011, REQ-012, M-004）。
**備考:** Claude summary はキャラクター表現なしのフラットな文体。

### 1-8: Sticky コメント出力フォーマット (High)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** 設計書セクション5および仕様書の Sticky コメント構成に従い、出力テンプレートを定義:
```
## Chollows PR Review
**{PR タイトル}** by @{author}
---
### 🚨 Critical / High（要対応）
### 📋 詳細レビュー
### ✅ 良い点
### 📊 統計
### Claude summary
```
コメントサイズ超過対策（60,000 文字制限、段階的圧縮）も含む（REQ-027）。
**備考:** 各お化け動物の絵文字（🐕🦫🐹🐦🦔🐙）を指摘元 agent の識別に使用。

### 1-9: インラインコメント投稿 (Medium)

**ファイル:** `plugins/chollows/skills/chollows-review/SKILL.md`
**現状:** なし
**目標:** diff position が計算できた指摘についてインラインコメントを投稿。422 エラー時はフォールバックリストに移動し Sticky コメントに追記。
**備考:** GitHub API の `pulls/{pr}/comments` エンドポイントを使用。commit_id は headRefOid。

---

## 検証ステップ

```bash
# SKILL.md の存在確認
test -f plugins/chollows/skills/chollows-review/SKILL.md && echo "OK"

# SKILL.md のサイズ確認（空でないこと）
wc -l plugins/chollows/skills/chollows-review/SKILL.md

# chollows-review-v1 マーカーが含まれていること
grep -q "chollows-review-v1" plugins/chollows/skills/chollows-review/SKILL.md && echo "OK: marker found"

# 6 agent の ID が全て参照されていること
for agent in shokupan damuo fuwafuwa yuki togetoge piko; do
  grep -q "$agent" plugins/chollows/skills/chollows-review/SKILL.md && echo "OK: $agent referenced" || echo "MISSING: $agent"
done

# Docker ビルドが引き続き成功すること
docker build -t chollows .
```

---

## 完了条件

- [ ] SKILL.md が全9タスクの内容を網羅している
- [ ] PR 情報収集（gh コマンド）が設計書セクション3の操作一覧と一致
- [ ] スキップ判定（Draft PR、skip_labels）が実装されている
- [ ] Sticky コメントマーカーが `<!-- chollows-review-v1 -->` である
- [ ] 6 agent の並列起動指示が含まれている
- [ ] Confidence ≥ 80 AND severity ≥ min_severity のフィルタ条件が明記されている
- [ ] 再レビュー時の修正済み判定ロジックが含まれている
- [ ] Claude summary セクション（統合サマリー + PR ディスクリプションレビュー）が含まれている
- [ ] Sticky コメント出力フォーマットが仕様書の構成と一致している
- [ ] Docker ビルドが成功する

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| Docker ビルド成功 | `docker build -t chollows .` 終了コード 0 | ✅ |
| SKILL.md が空でない | `wc -l` で 100 行以上 | ✅ |
| 6 agent 全ての ID が参照されている | `grep` で各 ID を確認 | ✅ |
| Sticky コメントマーカーが正しい | `grep "chollows-review-v1"` | ✅ |
| Confidence/severity フィルタ条件が明記 | `grep` で "Confidence" と "min_severity" を確認 | ✅ |
| DevInu / おやかた の参照が残っていない | `grep -i "devinu\|おやかた"` が空 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（feature-dev）
**スコープ:** `plugins/chollows/skills/chollows-review/SKILL.md` の変更（`git diff`）
**フォーカス:** プロンプトの論理的整合性、gh コマンドの正確性、エラーハンドリングの網羅性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> Claude Code プラグイン SKILL.md 設計の専門家として、フェーズ 1 の SKILL.md をレビューせよ:
> - Agent ツールの並列起動指示は Claude Code の仕様に沿っているか？（1メッセージで複数 Agent ツール呼び出し）
> - gh CLI コマンドの引数・フラグは正しいか？（特に `gh api` のエンドポイントパス）
> - Sticky コメントの HTML マーカー検索と更新のロジックは堅牢か？
> - rules.md の読み込みと agent への伝達方法は適切か？
> - disabled_agents のスキップロジックは正しく機能するか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 1 の SKILL.md のリグレッションと不足を批判的にレビューせよ:
> - 設計書セクション6の全ユースケース（UC-01〜UC-04）がカバーされているか？
> - 仕様書（hearing.md）で定義された Sticky コメント構成と完全に一致しているか？
> - エラーケース（設計書セクション8）が全て処理されているか？
> - フェーズ 2 で作成される agent.md の出力フォーマットとの整合性は保たれているか？
> - secrets の全文引用禁止（REQ-023）は SKILL.md レベルで担保されているか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** SKILL.md が各 agent に渡す情報（diff、ファイル一覧、rules.md、disabled_agents）の形式。agent の出力フォーマット（severity/file/line/title/description/suggestion/confidence）が確定。
- **設計判断の背景:** `disabled_agents` は SKILL.md 側でスキップする方式を採用（コスト効率優先）。`language` パラメータは SKILL.md が agent 起動時にプロンプトに注入する方式。
- **既知の制限事項:** agent.md がプレースホルダのため、実際の並列起動テストはフェーズ 2 完了後に行う。
- **共有ユーティリティ:** agent 出力フォーマット仕様（フェーズ 2 の全 agent が準拠すべき）。
