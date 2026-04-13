# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Chollows は、墓場に棲むお化け動物のエンジニアチームが PR をレビューする GitHub Actions ツール。Docker コンテナ内で Claude Code CLI を実行し、6匹の専門 agent を並列起動して多角的な PR レビューを行う。Claude Code プラグインとしてローカルでも利用可能。

## アーキテクチャ

### 二つの利用形態

1. **GitHub Actions（CI）**: `action.yml` → `Dockerfile` → `entrypoint.sh` → Claude Code CLI が `/chollows-review` スキルを実行
2. **ローカル（Claude Code プラグイン）**: `plugins/chollows/` をプラグインとしてインストールし、`/chollows-review <PR番号>` で実行

### レビューフロー

`chollows-review` スキル（Claude 統合役）がオーケストレーター。以下の流れで動作:

1. `gh pr view / gh pr diff` で PR 情報収集
2. スキップ判定（Draft PR、`skip-chollows` ラベル）
3. 6匹の agent を**並列起動**してレビュー（agent テーブル）
4. 結果統合: Confidence ≥ 80 AND severity ≥ min_severity でフィルタ → 重複排除 → severity 順ソート
5. CI なら Sticky コメント + インラインコメントで投稿、ローカルならターミナル出力

### Agent 一覧

| ID | 名前 | 元動物 | 担当 |
|----|------|--------|------|
| shokupan | しょくぱん | コーギー 🐕 | Frontend |
| damuo | だむお | ビーバー 🦫 | Architecture & Code Quality |
| wataame | わたあめ | チンチラ 🐹 | Docs / Types / API |
| omochi | おもち | シマエナガ 🐦 | Performance & Data |
| togetoge | とげとげ | ハリネズミ 🦔 | Security |
| pancake | パンケーキ | メンダコ 🐙 | Test Quality |

### ディレクトリ構造

- `plugins/chollows/` — Claude Code プラグイン本体（`plugin.json` + agents + skills）
- `.claude-plugin/marketplace.json` — マーケットプレイス登録用メタデータ
- `Dockerfile` + `entrypoint.sh` — GitHub Actions 用コンテナ

## 開発コマンド

```bash
# Docker イメージのビルド
docker build -t chollows .

# ローカルでレビュー実行
claude "/chollows-review <PR番号>"
```

## 重要な規約

- agent の出力フォーマットは `severity / file / line / title / description / confidence / suggestion` の構造化形式を守る
- Confidence スコア: 0-100 の整数。80 以上のみ報告対象
- secrets を発見した場合、全文を引用しない（事実のみ報告）
- CI とローカルの出力先分岐は `GITHUB_ACTIONS` 環境変数の有無で判定
- `disabled_agents` で特定 agent を無効化可能（カンマ区切り ID）
- Sticky コメントマーカー: `<!-- chollows-review-v1 -->`
- `MAX_BUDGET_USD` のデフォルトは $5
