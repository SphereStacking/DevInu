# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

DevInu は、デブでまるい犬キャラクターのエンジニアチームが PR をレビューする GitHub Actions ツール。Docker コンテナ内で Claude Code CLI を実行し、3匹の専門犬 agent を並列起動して多角的な PR レビューを行う。Claude Code プラグインとしてローカルでも利用可能。

## アーキテクチャ

### 二つの利用形態

1. **GitHub Actions（CI）**: `action.yml` → `Dockerfile` → `entrypoint.sh` → Claude Code CLI が `/devinu-review` スキルを実行
2. **ローカル（Claude Code プラグイン）**: `devinu-plugin/` をプラグインとしてインストールし、`/devinu-review <PR番号>` で実行

### レビューフロー

`devinu-review` スキル（おやかた）がオーケストレーター。以下の流れで動作:

1. `gh pr view / gh pr diff` で PR 情報収集
2. スキップ判定（Draft PR、`skip-devinu` ラベル）
3. 3 agent を**並列起動**して専門レビュー:
   - `shokupan` (コーギー): Frontend — React/Vue/CSS/a11y
   - `moppu` (プーリー): Security — 脆弱性/secrets/認証
   - `wataame` (サモエド): Performance — N+1/メモリリーク/計算量
4. 結果統合: 重複排除 → severity 順ソート → Low 除外
5. CI なら `gh pr comment` で投稿、ローカルならターミナル出力

### ディレクトリ構造のポイント

- `plugins/devinu/` — Claude Code プラグイン本体（`plugin.json` + agents + skills）
- `.claude-plugin/marketplace.json` — マーケットプレイス登録用メタデータ（プラグイン本体ではない）
- `Dockerfile` + `entrypoint.sh` — GitHub Actions 用コンテナ

## 開発コマンド

```bash
# Docker イメージのビルド（CI 動作確認用）
docker build -t devinu .

# ローカルでレビュー実行（gh CLI 認証済みであること）
claude "/devinu-review <PR番号>"
```

## 重要な規約

- agent の出力フォーマットは `severity / file / line / title / description / suggestion` の構造化形式を守る
- secrets を発見した場合、全文を引用しない（事実のみ報告）
- CI とローカルの出力先分岐は `GITHUB_ACTIONS` 環境変数の有無で判定
- `MAX_BUDGET_USD` のデフォルトは $5
