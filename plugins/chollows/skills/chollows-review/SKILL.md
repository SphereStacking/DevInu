---
name: chollows-review
description: Chollows お化け動物チームが PR を多角的にレビューする。6匹の専門 agent を並列起動し、指摘を統合して Sticky コメントとして投稿する。
arguments:
  - name: pr_number
    description: レビュー対象の PR 番号（整数）
    required: true
---

# chollows-review

あなたはオーケストレーター「Chollows」です。以下の手順に従って PR レビューを実行してください。

---

## ステップ 1: 入力検証

`$ARGUMENTS` から PR 番号を取得する。

PR 番号が整数でなければ次のメッセージを出力して終了する:

```
エラー: PR 番号には整数を指定してください。例: /chollows-review 42
```

以降 `PR_NUMBER` として扱う。

---

## ステップ 2: 環境変数の読み込み

以下の環境変数を読み取る。値が存在しない場合はデフォルトを使用する。

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `GITHUB_ACTIONS` | （未設定） | CI モード判定。存在すれば CI モード |
| `SKIP_LABELS` | `skip-chollows` | スキップ対象ラベル（カンマ区切り） |
| `DISABLED_AGENTS` | （未設定） | 無効化する agent 名（カンマ区切り） |
| `MIN_SEVERITY` | `medium` | フィルタ最低 severity。不正値は `medium` にフォールバック |
| `LANGUAGE` | `ja` | レビューコメントの言語 |
| `MAX_BUDGET_USD` | `5` | 予算上限（USD） |
| `REVIEW_INSTRUCTIONS` | （未設定） | 追加レビュー指示（`@chollows rereview` の後のテキスト） |

`MIN_SEVERITY` の有効値は `critical` / `high` / `medium` / `low`。それ以外は `medium` に設定する。

---

## ステップ 3: PR 情報収集

以下のコマンドを順に実行して PR 情報を収集する。

```bash
gh pr view $PR_NUMBER --json title,body,author,labels,isDraft,number
gh pr diff $PR_NUMBER
gh pr diff $PR_NUMBER --name-only
gh pr view $PR_NUMBER --json headRefOid --jq '.headRefOid'
gh repo view --json owner,name --jq '{owner: .owner.login, repo: .name}'
```

いずれかのコマンドが失敗した場合（PR が存在しない・権限エラー等）:

```
エラー: PR #$PR_NUMBER の情報を取得できませんでした。PR 番号と権限を確認してください。
```

を出力して終了する。CI モードで `EXISTING_COMMENT_ID` が存在する場合は、Sticky コメントにもエラーメッセージを PATCH する。

収集した情報を以下の変数として保持する:
- `PR_TITLE`: PR タイトル
- `PR_BODY`: PR 本文
- `PR_AUTHOR`: 作者のログイン名（`author` オブジェクトの `.login` フィールドを使用する）
- `PR_LABELS`: ラベル名の配列
- `IS_DRAFT`: 下書きフラグ（true/false）
- `PR_DIFF`: diff 全文
- `CHANGED_FILES`: 変更ファイルパスの一覧
- `HEAD_SHA`: HEAD コミット SHA（headRefOid）
- `REPO_OWNER`: リポジトリオーナー
- `REPO_NAME`: リポジトリ名

---

## ステップ 4: スキップ判定

### 4-1: Draft PR のスキップ（CI モードのみ）

`GITHUB_ACTIONS` 環境変数が存在し、かつ `IS_DRAFT` が `true` の場合:

```
Draft PR のためレビューをスキップします。PR が Ready になったら再度実行してください。
```

を出力して終了する。ローカル実行（`GITHUB_ACTIONS` 未設定）の場合はスキップしない。

### 4-2: スキップラベルの確認

`SKIP_LABELS` をカンマで分割し、`PR_LABELS` のいずれかと一致する場合:

```
スキップラベルが付与されているためレビューをスキップします。（ラベル: {一致したラベル名}）
```

を出力して終了する。

---

## ステップ 5: rules.md の読み込み

`.chollows/rules.md` が存在する場合は Read ツールで読み込み、内容を `CUSTOM_RULES` として保持する。存在しない場合は空文字とする。

---

## ステップ 6: Sticky コメントの管理（CI モードのみ）

CI モード（`GITHUB_ACTIONS` 環境変数あり）の場合のみ以下を実行する。

### 6-1: 既存 Sticky コメントの検索

マーカー: `<!-- chollows-review-v1 -->`

```bash
gh api /repos/$REPO_OWNER/$REPO_NAME/issues/$PR_NUMBER/comments
```

レスポンスから `body` に `<!-- chollows-review-v1 -->` を含むコメントを検索し、その `id` と `body` を記録する（`EXISTING_COMMENT_ID`、`EXISTING_COMMENT_BODY`）。見つからない場合は空とする。

### 6-2: レビュー開始コメントの投稿

既存コメントが存在しない場合は新規投稿する:

```bash
gh pr comment $PR_NUMBER --body "<!-- chollows-review-v1 -->
## 🏚️ Chollows PR Review
🔍 Chollows がレビュー中..."
```

既存コメントが存在する場合は PATCH 更新する:

```bash
gh api --method PATCH /repos/$REPO_OWNER/$REPO_NAME/issues/comments/$EXISTING_COMMENT_ID \
  --field body="<!-- chollows-review-v1 -->
## 🏚️ Chollows PR Review
🔍 Chollows がレビュー中..."
```

---

## ステップ 7: 修正済み判定（再レビュー時）

`EXISTING_COMMENT_BODY` が存在する場合、前回の指摘をパースする。

### パース対象フォーマット

既存コメント本文から以下のパターンを持つ指摘を抽出する（agent 絵文字と太字を含む）:

```
- {絵文字} `{ファイルパス}:{行番号}` — **{タイトル}**
```

絵文字は 🐕🦫🐹🐦🦔🐙 のいずれか。既に取り消し線（`~~`）で囲まれている指摘は「前回修正済み」として抽出対象外とする。

### 修正済み判定ルール

前回の指摘が「修正済み」と判定される条件:
- 指摘された `ファイルパス` が今回の diff に含まれている（変更対象ファイルである）、かつ
- 指摘された `行番号` 付近（±3行）が今回の diff で変更されている

これは「開発者がその箇所を再度変更した」ことを示す。修正内容の正否は新たなレビューで判断する。

修正済み指摘の表示形式:

```
~~- {絵文字} `{ファイルパス}:{行番号}` — **{タイトル}**~~ → **修正済み**
```

---

## ステップ 8: 6 agent の並列起動

`DISABLED_AGENTS` をカンマで分割し、無効化対象の agent ID セットを作成する。以下の 6 agent のうち、無効化対象に **含まれない** agent のみを起動する。

例: `DISABLED_AGENTS=omochi,pancake` の場合、shokupan/damuo/wataame/togetoge の 4 agent のみを起動する。

起動対象の agent を **1 メッセージで Agent ツールを複数回呼び出す形で並列起動**する。

### 各 agent に渡すプロンプトのテンプレート

```
以下の PR をレビューしてください。

## PR 情報
- タイトル: {PR_TITLE}
- 作者: @{PR_AUTHOR}
- PR 番号: #{PR_NUMBER}

## PR 本文
{PR_BODY}

## 変更ファイル一覧
{CHANGED_FILES}

## diff
{PR_DIFF}

{CUSTOM_RULES が存在する場合:}
## カスタムルール
{CUSTOM_RULES}

## 出力言語
{LANGUAGE}

{REVIEW_INSTRUCTIONS が存在する場合:}
## 追加レビュー指示
以下はレビュー依頼者からの追加指示です。この指示を考慮してレビューしてください。
{REVIEW_INSTRUCTIONS}

## 注意事項
- secrets や認証情報を発見した場合、全文を引用しない。事実のみ報告すること（REQ-023）
- 以下のフォーマットで指摘を出力すること

## 出力フォーマット（指摘ごとに繰り返す）
severity: Critical | High | Medium | Low
file: {ファイルパス}
line: {行番号}
title: {一行タイトル}
description: {説明}
confidence: {0-100 の整数}
suggestion: |
  {修正後のコード（オプション）}
---
```

### 各 agent の担当

| agent 名 | 絵文字 | 担当領域 | agent ファイル |
|----------|--------|---------|--------------|
| shokupan | 🐕 | Frontend — React/Vue/CSS/アクセシビリティ | agents/shokupan.md |
| damuo | 🦫 | Architecture — 設計/依存関係/凝集度 | agents/damuo.md |
| wataame | 🐹 | Docs/Types — 型定義/ドキュメント/コメント | agents/wataame.md |
| omochi | 🐦 | Performance — N+1/メモリリーク/計算量 | agents/omochi.md |
| togetoge | 🦔 | Security — 脆弱性/secrets/認証 | agents/togetoge.md |
| pancake | 🐙 | Test — カバレッジ/テスト妥当性/境界値 | agents/pancake.md |

各 agent は `plugin.json` に登録されているため、Agent ツールで名前を指定すれば Claude Code が自動的に agent.md を読み込む。手動で Read する必要はない。

---

## ステップ 9: 結果統合とフィルタ

### 9-1: フィルタリング

各 agent の出力から指摘をすべて収集し、以下の条件で絞り込む:

- `confidence >= 80` であること
- `severity` が `MIN_SEVERITY` 以上であること（以下の閾値テーブルで判定）

severity フィルタ閾値テーブル:
| MIN_SEVERITY | 通過する severity |
|---|---|
| `critical` | Critical のみ |
| `high` | Critical, High |
| `medium` | Critical, High, Medium |
| `low` | Critical, High, Medium, Low（すべて通過）|

### 9-2: 重複排除

同一の `file:line` の組み合わせを持つ指摘が複数ある場合、`confidence` が最も高いものを残す。同点の場合は `severity` が高いものを優先する。

### 9-3: ソート

フィルタ済み指摘を severity 降順でソートする:
1. Critical
2. High
3. Medium
4. Low

### 9-4: diff 変更行マップ構築

`PR_DIFF` を解析して、各ファイルの変更行番号（追加行: `+` で始まる行）のセットを構築する。再レビュー判定（ステップ 7）およびインラインコメント投稿（ステップ 11）で使用する。

---

## ステップ 10: サマリーと PR ディスクリプションレビュー

### 10-1: 統合サマリー

以下の情報を集計する:
- Critical / High 指摘数（要対応）
- Medium / Low 指摘数（軽微）
- 総合判定: Critical が 1 件以上 → `要修正`, High が 1 件以上 → `要確認`, それ以外 → `承認可`

### 10-2: PR ディスクリプションのレビュー

`PR_BODY` が以下のいずれかに該当する場合、改善提案を生成する:
- 3 行未満
- 100 文字未満

改善提案はステップ 12 の Sticky コメント内「Claude summary」セクションに含める。形式:

```markdown
#### 📝 PR ディスクリプション改善提案
> PR本文が簡潔すぎます。以下の項目を追加することを推奨します:
> - 背景・目的
> - 変更内容の概要
> - テスト方法
>
> （これはドラフト提案です。反映を希望する場合は手動で PR 本文を更新してください。）
```

文体はキャラクター表現なし、フラットに記述する。PR 本文は自動更新しない。

---

## ステップ 11: インラインコメントの投稿（CI モードのみ）

CI モードの場合のみ実行する。

フィルタ済み指摘のうち、`severity` が `High` 以上のものについて、指摘の `line` が今回の diff の変更行に含まれる場合にインラインコメントを投稿する:

```bash
gh api --method POST \
  /repos/$REPO_OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments \
  --field body="{コメント本文}" \
  --field commit_id="$HEAD_SHA" \
  --field path="{ファイルパス}" \
  --field line={行番号} \
  --field side="RIGHT"
```

### エラーハンドリング

422 エラーが返った場合、その指摘はフォールバックリストに移動する。フォールバックリストの指摘は Sticky コメントの末尾に「インラインコメント投稿失敗」セクションとして追記する。

---

## ステップ 12: Sticky コメントの構築と投稿

### 12-1: コメント本文の構築

以下の構造で Sticky コメントを構築する。文字数が 60,000 文字を超える場合は段階的に圧縮する（最初に Low の詳細を省略、次に Medium の詳細を省略）。

```markdown
<!-- chollows-review-v1 -->
## 🏚️ Chollows PR Review
**{PR_TITLE}** by @{PR_AUTHOR}

---
### 🚨 Critical / High（要対応）

{Critical・High の指摘一覧}
各指摘の形式:
- {agent絵文字} `{ファイルパス}:{行番号}` — **{タイトル}**
  {説明}
  ```
  {suggestion が存在する場合}
  ```

---
### 📋 詳細レビュー

#### Medium
{Medium の指摘一覧（Critical/High と同形式）}

#### Low（MIN_SEVERITY が low の場合のみ表示。それ以外はセクションごと省略する）
{Low の指摘一覧（Critical/High と同形式）}

---
### ✅ 良い点

{各 agent が報告した良い点をまとめる}

---
### 📊 統計

| 項目 | 件数 |
|------|------|
| Critical | {件数} |
| High | {件数} |
| Medium | {件数} |
| Low | {件数} |
| レビュー agent 数 | {起動した agent 数} |

---
### Claude summary

**総合判定: {承認可 / 要確認 / 要修正}**

- 重大指摘: {Critical + High 件数} 件
- 軽微指摘: {Medium + Low 件数} 件
{PR ディスクリプション改善提案（該当する場合のみ）}
{前回指摘の修正済みマーク一覧（再レビュー時のみ）}
{インラインコメント投稿失敗リスト（存在する場合のみ）}
```

各指摘の先頭絵文字は、報告した agent の識別子として使用する:
- 🐕 shokupan
- 🦫 damuo
- 🐹 wataame
- 🐦 omochi
- 🦔 togetoge
- 🐙 pancake

### 12-2: コメントの投稿

**CI モード**の場合:

既存コメント（`EXISTING_COMMENT_ID`）がある場合は PATCH 更新:
```bash
gh api --method PATCH \
  /repos/$REPO_OWNER/$REPO_NAME/issues/comments/$EXISTING_COMMENT_ID \
  --field body="{コメント本文}"
```

既存コメントがない場合は新規投稿:
```bash
gh pr comment $PR_NUMBER --body "{コメント本文}"
```

**ローカルモード**（`GITHUB_ACTIONS` 未設定）の場合:

構築したコメント本文をターミナルにそのまま出力する。

---

## 終了

レビュー完了後、以下を出力して終了する:

CI モード:
```
Chollows レビュー完了。PR #{PR_NUMBER} にコメントを投稿しました。
```

ローカルモード:
```
Chollows レビュー完了。（PR #{PR_NUMBER}）
```
