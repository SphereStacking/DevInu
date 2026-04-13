# 🏚️ Chollows

墓場に棲むお化け動物たちが、あなたの PR をレビューします。

Docker コンテナ内の Claude Code CLI を使い、6匹の専門エージェントが多角的な PR レビューを提供する GitHub Actions ツールです。

## Meet the Chollows

| 絵文字 | 名前 | 元動物 | 担当 |
|--------|------|--------|------|
| 🐕 | しょくぱん | コーギー | Frontend — React/Vue/CSS/アクセシビリティ |
| 🦫 | だむお | ビーバー | Architecture — 設計/可読性/命名/DRY |
| 🐹 | わたあめ | チンチラ | Docs/Types — 型定義/ドキュメント/API契約 |
| 🐦 | おもち | シマエナガ | Performance — N+1/メモリリーク/計算量 |
| 🦔 | とげとげ | ハリネズミ | Security — 脆弱性/secrets/認証 |
| 🐙 | パンケーキ | メンダコ | Test Quality — カバレッジ/テスト妥当性 |

全員下半身が幽霊尻尾のお化け動物。

## Quick Start

1. リポジトリの Settings → Secrets and variables → Actions で設定:
   - `ANTHROPIC_API_KEY`: Anthropic の API キー

2. `.github/workflows/chollows.yml` を作成:

```yaml
name: Chollows PR Review

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: chollows-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  chollows-review:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run Chollows
        uses: SphereStacking/Chollows@latest
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

3. PR を作成すると、Chollows チームが自動でレビューします！

## Configuration

| パラメータ | 必須 | デフォルト | 説明 |
|-----------|------|-----------|------|
| anthropic_api_key | ✅ | — | Anthropic API キー |
| min_severity | ❌ | medium | 表示する最低 severity（critical/high/medium/low） |
| max_budget_usd | ❌ | 5 | API コスト上限（USD） |
| language | ❌ | ja | レビュー言語 |
| disabled_agents | ❌ | — | 無効化する agent ID（カンマ区切り: shokupan,damuo,wataame,omochi,togetoge,pancake） |
| skip_labels | ❌ | skip-chollows | スキップ用ラベル（カンマ区切り） |

## Customization

### .chollows/ ディレクトリ
対象リポジトリに `.chollows/` ディレクトリを配置してカスタマイズ:

#### rules.md
`.chollows/rules.md` にプロジェクト固有のレビュールールを記述。全エージェントがルール違反を最優先で検出します。

例:
```markdown
- console.log は本番コードに残さないこと
- API エンドポイントは必ず認証ミドルウェアを通すこと
```

#### カスタムスキル
`.chollows/skills/` にカスタムスキルを配置して追加機能を実装できます。

## Triggers

| イベント | 説明 |
|---------|------|
| PR 作成・更新 | `pull_request: opened, synchronize` で自動発火 |
| 再レビュー | PR コメントに `@chollows rereview` と書くと再実行 |
| 指示付き再レビュー | `@chollows rereview セキュリティ重点的に見て` のように追加指示を渡せる |

## Skip

| 方法 | 説明 |
|------|------|
| Draft PR | CI では自動スキップ |
| ラベル | `skip-chollows` ラベルでスキップ |

## ローカル利用

Claude Code プラグインとしてローカルでも利用可能:

```bash
claude "/chollows-review 123"
```

※ `gh` CLI が認証済みである必要があります。

## ライセンス

MIT
