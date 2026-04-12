# フェーズ 2: Sticky コメント + トラッキング

**目的:** PR コメントを毎回新規作成せず、magic marker で識別した 1 つの Sticky コメントを upsert 管理する。レビュー開始時に「レビュー中...」を投稿し、完了後に結果で上書きする。これが後続のインラインコメントのフォールバック先にもなる。

**ステータス:** 完了
**前提条件:** フェーズ 1 完了（GHE_HOST / GH_HOSTNAME_ARGS 環境変数が利用可能）

**リスクレベル:** 高
**ロールバック:** SKILL.md の Sticky コメント関連ロジックを削除し、従来の `gh pr comment` に戻す

---

## タスク

### 2-1: おやかた（SKILL.md）に Sticky コメント upsert ロジック追加 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** `gh pr comment` で毎回新規コメントを作成
**目標:** 設計書 §6.2 の upsert フローが実装されている:
1. レビュー開始時: `gh api` で PR コメント一覧を取得し `<!-- devinu-review-v1 -->` を検索
2. 見つかれば PATCH で「レビュー中...」に更新、なければ POST で新規作成
3. `comment_id` を記憶（後の結果上書きで使用）
4. 全犬完了後: PATCH で結果（まとめコメント）で上書き
**備考:** `GH_HOSTNAME_ARGS` 環境変数を `gh api` 呼び出し時に使用（GHE 対応）

### 2-2: まとめコメントのフォーマット定義 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** まとめコメントの構造が簡易的
**目標:** 設計書に基づくまとめコメントフォーマットが SKILL.md に定義されている:
- `<!-- devinu-review-v1 -->` magic marker
- タイトル行（「🐕 DevInu レビュー結果」）
- 統計テーブル（犬ごとの指摘件数 × severity）
- 良い点セクション
- 実行時間（Xm Xs）
- Low 除外時の注記（「※ Low は詳細から除外」）
**備考:** 統計テーブルには全件数を表示し、MIN_SEVERITY に基づいて詳細セクションに含める指摘をフィルタする

### 2-3: コメントサイズ超過対策の実装 (High)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** サイズチェックなし
**目標:** 設計書 §8.4 に基づくトランケーションロジックが SKILL.md に記載されている:
1. 結果統合後にコメント本文の文字数をチェック
2. 65,536 文字に近づいた場合は Low severity の指摘本文を除外（統計テーブルには件数のみ残す）
3. それでも超過する場合は Medium の指摘本文も truncate し注記を追加
**備考:** GitHub API のコメント上限は 65,536 文字

### 2-4: MIN_SEVERITY 環境変数の参照 (High)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** Low 除外はハードコード
**目標:** `MIN_SEVERITY` 環境変数を参照して、結果統合時のフィルタ閾値を動的に決定する
**備考:** `MIN_SEVERITY=low` の場合は全件表示、`MIN_SEVERITY=high` の場合は High 以上のみ

### 2-5: SKIP_LABELS 環境変数の参照 (Medium)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** `skip-devinu` がハードコード
**目標:** `SKIP_LABELS` 環境変数（カンマ区切り）を参照してスキップ判定する
**備考:** PR のラベル一覧と SKIP_LABELS の各ラベルを照合

### 2-6: 「レビュー中...」初期コメントの投稿 (High)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** レビュー開始の通知なし
**目標:** agent 並列起動前に Sticky コメントとして「🐕 DevInu レビュー中... 各専門犬がレビューを実施しています。」を投稿する
**備考:** 設計書 §3.3.2 のリクエスト形式に従う。CI モードのみ（ローカルモードでは不要）

---

## 検証ステップ

```bash
# SKILL.md に magic marker が含まれること
grep 'devinu-review-v1' plugins/devinu/skills/devinu-review/SKILL.md && echo "Magic marker OK"

# SKILL.md に gh api 呼び出しが含まれること
grep 'gh api' plugins/devinu/skills/devinu-review/SKILL.md && echo "gh api OK"

# SKILL.md に GH_HOSTNAME_ARGS 参照があること
grep 'GH_HOSTNAME_ARGS' plugins/devinu/skills/devinu-review/SKILL.md && echo "GHE support OK"

# SKILL.md に MIN_SEVERITY 参照があること
grep 'MIN_SEVERITY' plugins/devinu/skills/devinu-review/SKILL.md && echo "MIN_SEVERITY OK"

# SKILL.md に SKIP_LABELS 参照があること
grep 'SKIP_LABELS' plugins/devinu/skills/devinu-review/SKILL.md && echo "SKIP_LABELS OK"

# Docker ビルド確認
docker build -t devinu-test . && echo "Docker build OK"
```

---

## 完了条件

- [ ] SKILL.md に Sticky コメントの upsert ロジック（検索→PATCH/POST）が記載されている
- [ ] `<!-- devinu-review-v1 -->` magic marker がコメント本文に含まれる
- [ ] レビュー開始時に「レビュー中...」Sticky コメントを投稿する指示がある
- [ ] 全犬完了後に結果でコメントを上書きする指示がある
- [ ] コメントサイズが 65,536 文字を超えないようにトランケーションロジックがある
- [ ] `MIN_SEVERITY` 環境変数を参照してフィルタ閾値を決定する
- [ ] `SKIP_LABELS` 環境変数を参照してスキップ判定する
- [ ] `GH_HOSTNAME_ARGS` を `gh api` 呼び出しで使用する
- [ ] Docker イメージがビルド可能

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| magic marker 存在 | `grep 'devinu-review-v1' SKILL.md` | ✅ |
| gh api 呼び出し存在 | `grep 'gh api' SKILL.md` | ✅ |
| GHE 対応（GH_HOSTNAME_ARGS） | `grep 'GH_HOSTNAME_ARGS' SKILL.md` | ✅ |
| MIN_SEVERITY 参照 | `grep 'MIN_SEVERITY' SKILL.md` | ✅ |
| upsert ロジック（PATCH/POST） | SKILL.md の内容レビュー | ✅ |
| コメントサイズチェック | SKILL.md にトランケーション記載 | ⚠️ 推奨 |
| Docker ビルド成功 | `docker build` 成功 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（pr-review-toolkit or feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff`）
**フォーカス:** SKILL.md の指示の明確性、gh api コマンドの正確性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> GitHub REST API と Claude Code Plugin の専門家として、フェーズ 2 の変更をレビューせよ:
> - Sticky コメントの upsert ロジックは GitHub Issues Comments API の仕様に準拠しているか？
> - `--jq` フィルタの構文は正しいか？（select, contains の使い方）
> - magic marker の衝突可能性はないか？（他のボットが同一 marker を使わないか）
> - SKILL.md の指示が Claude Code の Agent Tool の動作仕様と整合しているか？
> - MIN_SEVERITY の値バリデーション（不正値の場合のデフォルト動作）は考慮されているか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 2 のリグレッションと不足を批判的にレビューせよ:
> - 既存の `gh pr comment` ベースの投稿ロジックが完全に置き換えられているか？混在していないか？
> - ローカルモード（GITHUB_ACTIONS 環境変数なし）での動作に影響はないか？
> - race condition 対策（concurrency: cancel-in-progress）は SKILL.md に前提条件として記載されているか？
> - 65,536 文字のトランケーションロジックに off-by-one エラーの可能性はないか？
> - agent エラー時のスキップ挙動（設計書 §8.3）が SKILL.md に反映されているか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** おやかたが `comment_id` を保持しており、インラインコメントの 422 フォールバック時に Sticky コメントへ追記できること。magic marker `<!-- devinu-review-v1 -->` が一意であること。
- **設計判断の背景:** トラッキングコメントと Sticky コメントを統合（設計書で H-003 解決済み）。進捗は二段階（開始→完了）のみ。
- **既知の制限事項:** Claude Code の Agent Tool は中間状態を返さないため、犬ごとの進捗表示は不可。
- **共有ユーティリティ:** `GH_HOSTNAME_ARGS` パターンはフェーズ 3, 4 でも同様に使用。
