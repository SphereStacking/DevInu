# Chollows E2E テスト手順書

E2E テストは実際の GitHub App + Cloudflare Workers 環境が必要なため手動で実施する。
CI での自動化はコストが高いため、手動実施とする。

---

## テスト用 GitHub リポジトリの準備手順

### 前提条件

- Cloudflare Workers にデプロイ済みの Chollows Worker
- GitHub App が作成・インストール済み（`/setup/manifest` フローで作成）
- テスト用の GitHub リポジトリ（public または private）

### 手順

1. テスト用リポジトリを作成する
   ```
   gh repo create chollows-e2e-test --private --add-readme
   ```

2. Chollows GitHub App をテスト用リポジトリにインストールする
   - GitHub App のインストールページにアクセス
   - テスト用リポジトリを選択してインストール

3. Cloudflare Workers のシークレットが正しく設定されていることを確認する
   ```
   wrangler secret list
   ```
   以下が存在すること:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY`
   - `GITHUB_WEBHOOK_SECRET`
   - `ANTHROPIC_API_KEY`

4. Cloudflare Workers の Webhook URL を GitHub App に設定する
   - Webhook URL: `https://<worker-subdomain>.workers.dev/webhook`

---

## テストシナリオ

### シナリオ 1: Chollows をレビュアーに指定 → Sticky コメント + Review 投稿確認

**目的:** 基本的なレビューフローが正常に動作することを確認する。

**手順:**
1. テスト用リポジトリで新しいブランチを作成し、変更を加えてプッシュする
   ```bash
   git checkout -b test/e2e-scenario-1
   echo "// test change" >> src/index.ts
   git add . && git commit -m "test: E2E scenario 1"
   git push origin test/e2e-scenario-1
   ```
2. PR を作成し、レビュアーに Chollows Bot（`chollows[bot]`）を指定する
   ```bash
   gh pr create --title "E2E Test: Scenario 1" --body "テスト用 PR" --reviewer "chollows[bot]"
   ```
3. Cloudflare Workers のログを監視する
   ```bash
   wrangler tail
   ```
4. 2〜5 分待つ

**期待結果:**
- [ ] PR のコメントに `<!-- chollows-review-v1 -->` マーカーを含む Sticky コメントが投稿される
- [ ] Sticky コメントに `<!-- chollows-data:v1 ... -->` マーカーを含む Base64 データが含まれる
- [ ] PR に GitHub Review（APPROVE / COMMENT / REQUEST_CHANGES のいずれか）が投稿される
- [ ] Workers ログにエラーが出ていない

---

### シナリオ 2: Re-request review → 新 Review 投稿 + 旧 Review 残存確認

**目的:** Re-request review 時に前回の指摘を引き継いで新しいレビューが行われることを確認する。

**前提:** シナリオ 1 が完了していること。

**手順:**
1. シナリオ 1 の PR に追加コミットを加える
   ```bash
   echo "// another change" >> src/index.ts
   git add . && git commit -m "test: additional change for re-request"
   git push origin test/e2e-scenario-1
   ```
2. GitHub の PR ページで「Re-request review」ボタンをクリックして Chollows に再度レビューを依頼する
3. 5 分待つ

**期待結果:**
- [ ] 新しい GitHub Review が追加される（旧 Review は残ったまま）
- [ ] Sticky コメントが更新される（前回の指摘との差分が反映される）
- [ ] Workers ログに `previousFindings found` が出力されている
- [ ] Workers ログにエラーが出ていない

---

### シナリオ 3: `@chollows security を確認して` → セキュリティ中心のレビュー + 返信投稿確認

**目的:** `@chollows` コメントの指示テキストが `REVIEW_INSTRUCTIONS` として渡され、SKILL.md 側で適切な agent が選択されることを確認する。

**手順:**
1. テスト用 PR（既存または新規）のコメントに以下を投稿する
   ```
   @chollows security を詳しく確認してください
   ```
2. Workers ログを監視する
   ```bash
   wrangler tail
   ```
3. 3〜5 分待つ

**期待結果:**
- [ ] PR のコメントまたは Review が投稿される
- [ ] SKILL.md の判断により、セキュリティ関連の agent（togetoge）が中心にレビューしている
- [ ] `@chollows` コメントへの返信コメントが投稿される

---

### シナリオ 4: 同時に 2 回 Re-request → cancel-in-progress 動作確認

**目的:** 連続した Re-request review で先行レビューがキャンセルされることを確認する。

**手順:**
1. テスト用 PR で Re-request review を 2 回素早く連続してトリガーする
   （GitHub UI での「Re-request review」を素早く 2 回クリック、または API で連続送信）
   ```bash
   # API で連続送信する場合
   gh api repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers \
     --method POST \
     --field "reviewers[]=chollows[bot]"
   sleep 2
   gh api repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers \
     --method POST \
     --field "reviewers[]=chollows[bot]"
   ```
2. Workers ログを監視する

**期待結果:**
- [ ] Workers ログに `cancelled previous review for` が出力される（cancel-in-progress）
- [ ] 最終的に 1 つの Review が投稿される（2 つではない）
- [ ] PRReviewDO の状態が最終的に `completed` または `cancelled` になる

---

### シナリオ 5: PR クローズ → state 削除確認

**目的:** PR クローズ時に Durable Object の状態が削除されることを確認する。

**手順:**
1. レビュー済みまたは未レビューの PR をクローズする
   ```bash
   gh pr close PR_NUMBER
   ```
2. Workers ログを確認する

**期待結果:**
- [ ] Workers ログに `pull_request.closed received` が出力される
- [ ] PRReviewDO への DELETE リクエストが送信される
- [ ] ログにエラーが出ていない

**補足確認:**
PRReviewDO の状態が削除されたことを確認するには、同じ PR を再オープンして Chollows をレビュアーに再指定した場合に「初回扱い」となること（`previousFindings` なし）を確認する。

---

## ログ確認コマンド

```bash
# リアルタイムログ監視
wrangler tail

# 特定のキーワードでフィルタ
wrangler tail --format pretty | grep -E "webhook|container|error"

# エラーのみ表示
wrangler tail --format pretty | grep -i "error"
```

---

## トラブルシューティング

| 症状 | 確認ポイント |
|------|------------|
| Webhook が届かない | GitHub App の Webhook URL 設定、Cloudflare Workers の URL |
| 署名検証失敗（401） | `GITHUB_WEBHOOK_SECRET` が GitHub App の設定と一致しているか |
| Token 取得失敗 | `GITHUB_APP_ID` と `GITHUB_APP_PRIVATE_KEY` が正しいか |
| Container が起動しない | `ANTHROPIC_API_KEY` が有効か、Container バインディングの設定 |
| コメントが投稿されない | GitHub App のパーミッション（`issues: write`, `pull_requests: write`）を確認 |
