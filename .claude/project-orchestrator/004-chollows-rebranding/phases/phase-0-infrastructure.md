# フェーズ 0: Infrastructure & Plugin Structure

**目的:** DevInu のインフラストラクチャ（Dockerfile・entrypoint.sh・action.yml）と プラグインディレクトリ構造を Chollows に全面切り替える。後続フェーズの基盤となるファイル構成を確立する。

**ステータス:** 未開始
**前提条件:** なし

**リスクレベル:** 低
**ロールバック:** `git checkout` で全変更を元に戻す。Docker イメージは再ビルドで復元可能。

---

## タスク

### 0-1: プラグインディレクトリ構造の作成 (Critical)

**ファイル:** `plugins/chollows/`
**現状:** `plugins/devinu/` に旧プラグインが存在
**目標:** `plugins/chollows/` を新規作成し、`plugin.json` を配置。agents/ と skills/chollows-review/ のディレクトリを作成（中身は後続フェーズ）。旧 `plugins/devinu/` は削除。
**備考:** `plugin.json` は設計書セクション5のJSON定義に従う。agents/ 配下には6つの空ファイル（shokupan.md, damuo.md, fuwafuwa.md, yuki.md, togetoge.md, piko.md）をプレースホルダとして配置。skills/chollows-review/SKILL.md も最小限のプレースホルダを配置。

### 0-2: Dockerfile の Chollows 対応 (Critical)

**ファイル:** `Dockerfile`
**現状:** USER 名 `devinu`、COPY 先 `/devinu-plugin`、pr-review-toolkit のクローン処理あり
**目標:** USER 名を `chollows` に変更。COPY 先を `/chollows-plugin` に変更。pr-review-toolkit のクローン処理を削除（REQ-020）。ディレクトリ作成・権限設定を更新。
**備考:** `node:22-slim` ベースは維持。COPY 元は `plugins/chollows/` に変更。

### 0-3: entrypoint.sh の Chollows 対応 (Critical)

**ファイル:** `entrypoint.sh`
**現状:** `SKIP_LABELS` デフォルトが `skip-devinu`、`.chollows/` 検出なし、`DISABLED_AGENTS` 未対応、`--plugin-dir /devinu-plugin` と `/pr-review-toolkit-plugin` を指定
**目標:**
- `SKIP_LABELS` デフォルトを `skip-chollows` に変更
- `DISABLED_AGENTS` と `LANGUAGE` 環境変数のデフォルト設定追加
- `.chollows/` 検出ロジック追加（`/github/workspace/.chollows/skills` or `agents` が存在すれば `--plugin-dir` 追加）
- `--plugin-dir /chollows-plugin` に変更（pr-review-toolkit 削除）
- スキル起動コマンドを `/chollows-review` に変更
**備考:** 設計書セクション8のエラー制御（set -euo pipefail）は維持。`.chollows/` 検出は Claude CLI 起動前に行う。

### 0-4: action.yml の Chollows 対応 (High)

**ファイル:** `action.yml`
**現状:** DevInu 向けの name / description / input パラメータ
**目標:** name / description を Chollows に変更。input パラメータを設計書セクション3の定義に合わせて更新（`anthropic_api_key`, `min_severity`, `max_budget_usd`, `language`, `disabled_agents`, `skip_labels`）。`enable_ci_analysis` と `extra_skills` パラメータを削除。Docker image URL を更新。
**備考:** `disabled_agents` は string 型（カンマ区切り）で受け取り、環境変数 `DISABLED_AGENTS` として渡す。

### 0-5: marketplace.json の更新 (Medium)

**ファイル:** `.claude-plugin/marketplace.json`
**現状:** DevInu の名称・説明
**目標:** name / description を Chollows に更新
**備考:** マーケットプレイス登録用メタデータ。プラグイン本体ではない。

---

## 検証ステップ

```bash
# Docker イメージのビルド成功を確認
docker build -t chollows .

# プラグインディレクトリ構造の確認
ls -R plugins/chollows/

# plugin.json の構文チェック
cat plugins/chollows/plugin.json | python3 -m json.tool

# entrypoint.sh の構文チェック
bash -n entrypoint.sh

# 旧 DevInu ディレクトリが削除されていること
test ! -d plugins/devinu && echo "OK: devinu removed"
```

---

## 完了条件

- [ ] `plugins/chollows/` ディレクトリが正しい構造で存在する
- [ ] `plugins/chollows/plugin.json` が有効な JSON で、6 agent と 1 skill を参照している
- [ ] `Dockerfile` が `docker build -t chollows .` でビルド成功する
- [ ] `entrypoint.sh` が `.chollows/` 検出ロジックを含む
- [ ] `action.yml` が設計書セクション3の6パラメータを定義している
- [ ] `plugins/devinu/` が削除されている
- [ ] pr-review-toolkit のクローン処理が Dockerfile から削除されている

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| Docker ビルド成功 | `docker build -t chollows .` 終了コード 0 | ✅ |
| plugin.json が有効な JSON | `python3 -m json.tool` で検証 | ✅ |
| entrypoint.sh 構文エラーなし | `bash -n entrypoint.sh` | ✅ |
| 旧 devinu ディレクトリ削除済み | `test ! -d plugins/devinu` | ✅ |
| 全ファイルに DevInu 参照が残っていない | `grep -r "devinu" Dockerfile entrypoint.sh action.yml plugins/chollows/plugin.json` が空 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff` で取得）
**フォーカス:** Dockerfile のセキュリティ（非 root ユーザー、secrets 漏洩）、entrypoint.sh のエラーハンドリング

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> Docker / GitHub Actions / シェルスクリプトの専門家として、フェーズ 0 の変更をレビューせよ:
> - Dockerfile は非 root ユーザー（chollows）で正しく実行されるか？
> - entrypoint.sh の `.chollows/` 検出ロジックは堅牢か？（ディレクトリが存在しない場合、空の場合）
> - action.yml の入力パラメータは環境変数として正しくコンテナに渡されるか？
> - plugin.json の参照パスは実際のファイル構造と一致しているか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 0 のリグレッションと不足を批判的にレビューせよ:
> - DevInu 時代の参照（文字列、パス、コメント）が完全に除去されているか？
> - 後続フェーズ（SKILL.md、agent.md）のプレースホルダは適切か？フェーズ 1/2 が前提とする構造は満たされているか？
> - Docker ビルドキャッシュが正しく効くか？（レイヤー順序の最適性）
> - GitHub Actions の `uses: SphereStacking/Chollows@v1` で正しく動作する構成になっているか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** `plugins/chollows/skills/chollows-review/SKILL.md` と `plugins/chollows/agents/*.md` のファイルパスが確定している。`plugin.json` でこれらを参照済み。
- **設計判断の背景:** pr-review-toolkit を削除し、その観点を6匹の agent に吸収する方針（REQ-020）。
- **既知の制限事項:** SKILL.md と agent.md はプレースホルダ状態。フェーズ 1 と 2 で実装される。
- **共有ユーティリティ:** `entrypoint.sh` の `.chollows/` 検出ロジックは、対象リポジトリ側のカスタムスキルを自動読み込みする基盤。
