# DevInu 🐕

デブでまるい犬キャラクターのエンジニアチームが、あなたの PR をレビューします。

Docker コンテナ内の Claude Code CLI を使い、コードベース全体を読んだうえで多角的な PR レビューを提供する GitHub Actions ツールです。

## クイックスタート

1. リポジトリの Settings → Secrets and variables → Actions で以下を設定:
   - `ANTHROPIC_API_KEY`: Anthropic の API キー

2. `.github/workflows/devinu.yml` を作成:

```yaml
name: DevInu PR Review

on:
  pull_request:
    types: [opened]
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: devinu-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true

jobs:
  devinu-review:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: |
      github.event_name == 'pull_request' ||
      (
        github.event_name == 'issue_comment' &&
        github.event.issue.pull_request != null &&
        contains(github.event.comment.body, '@devinu rereview') &&
        github.event.comment.user.login != 'github-actions[bot]'
      )
    steps:
      - name: Run DevInu
        uses: SphereStacking/DevInu@v0.1.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number || github.event.issue.number }}
```

3. PR を作成すると、DevInu チームが自動でレビューします！

## 犬キャラクター

| 絵文字 | 名前 | 犬種 | 役割 |
|--------|------|------|------|
| 🏠 | おやかた | ブルドッグ | リーダー。チームをまとめ、レビュー結果を統合する |
| 🍞 | しょくぱん | コーギー | Frontend（React/Vue/CSS/アクセシビリティ） |
| 🧹 | もっぷ | プーリー | Security（認証・脆弱性・secrets 検出） |
| 🍬 | わたあめ | サモエド | Performance（N+1クエリ・メモリリーク・計算量） |

全員デブでまるい。

## 設定

DevInu はゼロコンフィグで動作します。追加設定は不要です。

プロジェクト固有のルールがある場合は、リポジトリのルートに `CLAUDE.md` を配置してください。Claude Code が自動で読み込み、レビュー時に考慮します。

## トリガー

| イベント | 説明 |
|---------|------|
| PR 作成 | `pull_request: opened` で自動発火 |
| 再レビュー | PR コメントに `@devinu rereview` と書くと再実行 |

## スキップ

| 方法 | 説明 |
|------|------|
| Draft PR | CI では自動スキップ（ローカル実行ではスキップしない） |
| ラベル | PR に `skip-devinu` ラベルを付けるとスキップ |

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API キー |
| `GITHUB_TOKEN` | ✅ | GitHub Actions が自動発行 |
| `MAX_BUDGET_USD` | ❌ | Claude Code のコスト上限（デフォルト: $5） |

## ローカル利用

### インストール

Claude Code 内で以下を実行:

```
/plugin marketplace add SphereStacking/DevInu
/plugin install devinu@SphereStacking/DevInu
```

### 使い方

```bash
claude "/devinu-review 123"
```

※ `gh` CLI が認証済みである必要があります。

## ライセンス

MIT
