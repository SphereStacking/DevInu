# コードベース分析レポート — DevInu → Chollows リブランディング

**対象:** /Users/sphere/Develop/reps/SphereStacking/DevInu
**分析日:** 2026-04-13

---

## 1. 技術スタック

| カテゴリ | 技術 | 詳細 |
|---------|------|------|
| コンテナ | Docker | `node:22-slim` ベース |
| CI/CD | GitHub Actions | Container Action (`action.yml` → Docker image) |
| AI ランタイム | Claude Code CLI | `@anthropic-ai/claude-code` (npm global install) |
| プラグインシステム | Claude Code Plugin | `.claude-plugin/plugin.json` + agents/ + skills/ |
| GitHub CLI | `gh` | PR 情報取得・コメント投稿 |
| 外部プラグイン | pr-review-toolkit | Anthropic 公式 claude-plugins-official から git clone |
| パッケージレジストリ | GHCR | `ghcr.io/spherestacking/devinu:latest` |

---

## 2. キャラクター定義ファイル（agents/*.md）の構造とパターン

### ファイル一覧

| ファイル | name (frontmatter) | キャラクター | 犬種 | 役割 | アイコン |
|---------|-------------------|------------|------|------|---------|
| `plugins/devinu/agents/shokupan.md` | shokupan | しょくぱん | コーギー | Frontend (React/Vue/CSS/a11y) | 🍞 |
| `plugins/devinu/agents/moppu.md` | moppu | もっぷ | プーリー | Security | 🧹 |
| `plugins/devinu/agents/wataame.md` | wataame | わたあめ | サモエド | Performance | 🍬 |
| `plugins/devinu/agents/beko.md` | beko | べこ | ダルメシアン | Test Quality | 🐄 |
| `plugins/devinu/agents/wawachi.md` | wawachi | わわち | チワワ | Docs / Types | 🐾 |
| `plugins/devinu/agents/chikuwa.md` | chikuwa | ちくわ | ダックスフンド | CI Analysis (条件付き起動) | 🌭 |

### 共通構造パターン

各 agent の `.md` ファイルは以下の統一構造を持つ:

```
---
name: {英語名}
description: {専門分野}専門の犬エンジニア agent
---

# {アイコン} {日本語名}（{犬種}）— {専門分野} Reviewer

## ロール
あなたは {アイコン} {日本語名}、{犬種}の {専門分野} エンジニア。
{キャラクター描写}。
チームのリーダー犬おやかたから呼ばれて、PR の {専門分野} 観点のレビューを担当する。

## レビュー観点
- {観点リスト}

## レビュー対象ファイル
- {ファイルパターン}

## 出力フォーマット
severity: Critical | High | Medium | Low
file: {ファイルパス}
line: {行番号}
title: {一行タイトル}
description: {説明}
suggestion: |
  {修正後コード}

### 良い点の報告
positive: {良い点}
file: {ファイルパス}

## 注意事項
- {agent 固有の注意事項}
```

### 共通特徴

- 全 agent が「デブでまるい」キャラクター設定
- 全 agent が「チームのリーダー犬おやかたから呼ばれて」という文言
- 出力フォーマットは全 agent 共通 (severity/file/line/title/description/suggestion)
- 良い点の報告 (positive) も全 agent 共通
- chikuwa のみ file/line が省略可

---

## 3. SKILL.md のオーケストレーション構造

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`

### frontmatter

```yaml
name: devinu-review
description: デブでまるい犬チームによる PR レビュー
user_invocable: true
```

### 実行フロー

1. **引数解析** — PR 番号取得
2. **PR 情報収集** — `gh pr view`, `gh pr diff`, files, headRefOid
3. **スキップ判定** — Draft PR (CI のみ), `SKIP_LABELS` ラベル (デフォルト: `skip-devinu`)
4. **Sticky コメント投稿** — `<!-- devinu-review-v1 -->` マーカー付き
5. **犬 agent 並列起動** — 5 犬 + pr-review-toolkit 2 agent を同時並列 (計 7)
   - `devinu:shokupan`, `devinu:moppu`, `devinu:wataame`, `devinu:beko`, `devinu:wawachi`
   - `pr-review-toolkit:code-reviewer`, `pr-review-toolkit:silent-failure-hunter`
6. **ちくわ条件付き起動** — `ENABLE_CI_ANALYSIS=true` かつ CI 失敗ありの場合のみ
7. **diff position マップ構築** — インラインコメント用
8. **前回指摘の修正チェック** — 再レビュー時のみ
9. **結果統合** — 重複排除、severity ソート、MIN_SEVERITY フィルタ、サイズ超過対策
10. **出力** — CI: Sticky コメント PATCH + インラインコメント POST / ローカル: ターミナル出力

### 出力フォーマット内の DevInu 参照

- HTML コメントマーカー: `<!-- devinu-review-v1 -->`
- ヘッダー: `## 🐕 DevInu PR Review`
- レビュー中メッセージ: `## 🐕 DevInu レビュー中...`

---

## 4. 主要設定ファイルの現在の構成

### action.yml

- `name: DevInu PR Review`
- `description: "デブでまるい犬キャラチームによる PR レビュー"`
- `image: docker://ghcr.io/spherestacking/devinu:latest`
- inputs: `max_budget_usd`, `min_severity`, `enable_ci_analysis`, `skip_labels` (default: `skip-devinu`)

### Dockerfile

- ベース: `node:22-slim`
- インストール: curl, git, gh CLI, `@anthropic-ai/claude-code`
- 非 root ユーザー: `devinu` (useradd)
- パス: `/devinu-plugin`, `/workspace`
- COPY: `plugins/devinu/` → `/devinu-plugin/`
- 外部プラグイン: `pr-review-toolkit` を git clone で取得
- ENTRYPOINT: `/entrypoint.sh`

### entrypoint.sh

- 必須環境変数: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_REPOSITORY`, `PR_NUMBER`
- GHE ホスト対応あり
- デフォルト: `SKIP_LABELS=skip-devinu`
- 実行: `claude -p "/devinu-review $PR_NUMBER" --plugin-dir /devinu-plugin --plugin-dir /pr-review-toolkit-plugin`

### plugin.json

**ファイル:** `plugins/devinu/.claude-plugin/plugin.json`

```json
{
  "name": "devinu",
  "description": "デブでまるい犬キャラのエンジニアチームが PR をレビューする",
  "version": "0.1.0"
}
```

---

## 5. README.md の現在の内容

- タイトル: `# DevInu 🐕`
- 概要: デブでまるい犬キャラクターのエンジニアチーム PR レビュー
- クイックスタート: workflow YAML 例 (`devinu.yml`)
- 犬キャラクター表（6 犬）
- 設定: ゼロコンフィグ
- トリガー: PR opened, `@devinu rereview`
- スキップ: Draft PR, `skip-devinu` ラベル
- 環境変数表
- ローカル利用: `/plugin marketplace add SphereStacking/DevInu` → `/plugin install devinu@devinu-marketplace`
- ライセンス: MIT

---

## 6. 「DevInu」「devinu」が使われている全箇所のリスト

### ソースファイル（実動作に影響するもの）

| ファイル | 行 | 内容 | 影響度 |
|---------|-----|------|-------|
| `action.yml` | 1 | `name: DevInu PR Review` | GitHub Marketplace 表示名 |
| `action.yml` | 17 | `default: "skip-devinu"` | スキップラベル名 |
| `action.yml` | 21 | `image: docker://ghcr.io/spherestacking/devinu:latest` | Docker イメージ参照 |
| `Dockerfile` | 24 | `useradd -m -s /bin/bash devinu` | コンテナ内ユーザー名 |
| `Dockerfile` | 25 | `mkdir -p /devinu-plugin ... chown devinu:devinu` | パス名・ユーザー名 |
| `Dockerfile` | 28 | `COPY --chown=devinu:devinu plugins/devinu/ /devinu-plugin/` | パス名・ユーザー名 |
| `Dockerfile` | 34 | `chown -R devinu:devinu /pr-review-toolkit-plugin` | ユーザー名 |
| `Dockerfile` | 37 | `COPY --chown=devinu:devinu entrypoint.sh /entrypoint.sh` | ユーザー名 |
| `entrypoint.sh` | 25 | `SKIP_LABELS="${SKIP_LABELS:-skip-devinu}"` | デフォルトラベル名 |
| `entrypoint.sh` | 45-47 | `# DevInu レビュー実行`, `/devinu-review`, `/devinu-plugin` | コメント・パス名 |
| `plugins/devinu/.claude-plugin/plugin.json` | 2 | `"name": "devinu"` | プラグイン名 (namespace) |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 2 | `name: devinu-review` | スキル名 |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 3 | `description: デブでまるい犬チームによる PR レビュー` | 説明文 |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 7 | `# 🏠 おやかた（ブルドッグ）— DevInu レビューリーダー` | 見出し |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 11 | `DevInu チームのリーダー犬` | ロール説明 |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 48 | `"skip-devinu"` | ラベル名参照 |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 62 | `<!-- devinu-review-v1 -->` | HTML コメントマーカー |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 66-67 | `## 🐕 DevInu レビュー中...` | Sticky コメント |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 70-73 | `## 🐕 DevInu レビュー中...` (POST版) | Sticky コメント |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 84-87 | `devinu:shokupan` 等 5 agent 参照 | agent 呼び出し namespace |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 109 | `devinu:chikuwa` | agent 呼び出し namespace |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 199 | `<!-- devinu-review-v1 -->` | Sticky コメントマーカー |
| `plugins/devinu/skills/devinu-review/SKILL.md` | 274 | `## 🐕 DevInu PR Review` | 出力ヘッダー |

### ワークフローファイル

| ファイル | 行 | 内容 |
|---------|-----|------|
| `.github/workflows/example-devinu.yml` | 1 | `name: DevInu PR Review` |
| `.github/workflows/example-devinu.yml` | 15 | `group: devinu-${{ ... }}` |
| `.github/workflows/example-devinu.yml` | 19 | `devinu-review:` (job 名) |
| `.github/workflows/example-devinu.yml` | 29 | `@devinu rereview` |
| `.github/workflows/example-devinu.yml` | 36-37 | `Run DevInu`, `ghcr.io/spherestacking/devinu:latest` |
| `.github/workflows/example-devinu.yml` | 44 | `skip-devinu` |
| `.github/workflows/docker-publish.yml` | 24 | `images: ghcr.io/spherestacking/devinu` |

### ドキュメント・設定ファイル

| ファイル | 参照数 | 内容 |
|---------|--------|------|
| `README.md` | 16箇所 | タイトル、ワークフロー例、コマンド例、ラベル名等 |
| `CLAUDE.md` | 12箇所 | プロジェクト概要、アーキテクチャ説明 |
| `.claude-plugin/marketplace.json` | 5箇所 | name, source, description |

### ディレクトリ・パス名

| パス | 種類 |
|------|------|
| `plugins/devinu/` | ディレクトリ |
| `plugins/devinu/.claude-plugin/` | ディレクトリ |
| `plugins/devinu/agents/` | ディレクトリ |
| `plugins/devinu/skills/devinu-review/` | ディレクトリ |

### 歴史的ファイル (.claude/ 配下の設計文書)

`.claude/spec-refiner/` と `.claude/spec-architect/` 内の設計文書・ヒアリング記録に大量の DevInu 参照あり。これらは過去の仕様検討記録であり、リブランディング時に更新するかは判断が必要。

---

## 7. マーケットプレイス関連設定

### `.claude-plugin/marketplace.json` (リポジトリルート)

```json
{
  "name": "devinu",
  "owner": { "name": "SphereStacking" },
  "metadata": {
    "description": "まるくて太いエンジニアワンチャンチームが、あなたのコードを見守ります",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "devinu",
      "source": "./plugins/devinu",
      "description": "デブでまるい犬キャラクターのエンジニアチームが PR をレビューする",
      "version": "0.1.0",
      "author": { "name": "SphereStacking" },
      "license": "MIT",
      "keywords": ["pr-review", "code-review", "dog"]
    }
  ]
}
```

### `plugins/devinu/.claude-plugin/plugin.json` (プラグイン本体)

```json
{
  "name": "devinu",
  "description": "デブでまるい犬キャラのエンジニアチームが PR をレビューする",
  "version": "0.1.0"
}
```

### Docker イメージレジストリ

- GHCR: `ghcr.io/spherestacking/devinu`
- `action.yml` から `docker://ghcr.io/spherestacking/devinu:latest` で参照
- `.github/workflows/docker-publish.yml` でビルド・プッシュ

### GitHub Action

- `uses: SphereStacking/DevInu@v0.1.0` (README 記載)
- リポジトリ名: `SphereStacking/DevInu`

---

## 8. リブランディング影響範囲サマリー

### 変更必須（動作に直結）

1. **リポジトリ名**: `SphereStacking/DevInu` → `SphereStacking/Chollows` (GitHub 側)
2. **Docker イメージ**: `ghcr.io/spherestacking/devinu` → 新名称
3. **プラグイン名 (namespace)**: `plugin.json` の `"name": "devinu"` → agent 呼び出しの `devinu:shokupan` 等に連鎖
4. **スキル名**: `devinu-review` → 新名称 (ディレクトリ名 + frontmatter)
5. **スキップラベル**: `skip-devinu` → 新名称
6. **HTML マーカー**: `<!-- devinu-review-v1 -->` → 新マーカー (既存コメントとの互換性注意)
7. **コンテナ内パス**: `/devinu-plugin` → 新パス
8. **コンテナ内ユーザー**: `devinu` → 新ユーザー名
9. **再レビューコマンド**: `@devinu rereview` → 新コマンド
10. **marketplace.json**: name, source, description

### 変更推奨（表示・ドキュメント）

1. **README.md**: 全面書き換え
2. **CLAUDE.md**: プロジェクト概要更新
3. **action.yml**: name, description
4. **SKILL.md**: ロール説明、出力フォーマット内テキスト
5. **ワークフロー例**: ファイル名 + 内容
6. **キャラクター設定**: 「デブでまるい犬」の設定をどうするか（維持 or 変更）

### 判断が必要な事項

1. `.claude/` 配下の過去設計文書を更新するか
2. キャラクター名（しょくぱん、もっぷ等）を変更するか
3. 犬種設定を変更するか
4. 「デブでまるい」の世界観を維持するか
5. Git タグ・リリースの移行方法 (v0.1.0 → 新バージョン体系)
6. 既存ユーザーの Sticky コメントマーカー互換性 (`<!-- devinu-review-v1 -->`)
