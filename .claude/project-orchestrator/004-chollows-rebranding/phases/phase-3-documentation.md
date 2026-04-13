# フェーズ 3: README & Documentation

**目的:** README.md を Chollows 対応に全面改訂し、CLAUDE.md を更新し、全体の整合性を確認する。

**ステータス:** 未開始
**前提条件:** フェーズ 1, 2 完了（SKILL.md と全 agent.md が確定していること）

**リスクレベル:** 低
**ロールバック:** `git checkout README.md CLAUDE.md` で元に戻す。

---

## タスク

### 3-1: README.md 全面改訂 (Critical)

**ファイル:** `README.md`
**現状:** DevInu 向けの README
**目標:** 仕様書の README 構成に従い全面改訂:
```
# Chollows
キャッチコピー（1行）

## What is Chollows?
コンセプト説明（墓場の世界観、2-3行）

## Meet the Chollows
6匹の図鑑（絵文字 + 名前 + 元動物 + 担当観点）

## Quick Start
GitHub Actions の設定例（最小構成）

## Configuration
action.yml のパラメータ一覧

## Customization
.chollows/ の使い方（rules.md, カスタムスキル）

## Output Example
実際の PR コメントのサンプル
```
**備考:** 6匹の情報は設計書セクション5のテーブルから。Quick Start は action.yml の最小設定。Output Example は仕様書のサンプル出力から。

### 3-2: CLAUDE.md の更新 (High)

**ファイル:** `CLAUDE.md`
**現状:** DevInu の説明（プロジェクト概要、アーキテクチャ、犬キャラ名）
**目標:** Chollows に全面更新:
- プロジェクト概要: 「お化け動物のエンジニアチームが PR をレビュー」
- アーキテクチャ: レビューフロー（Claude 統合役 → 6匹並列 → 結果統合）
- agent ID テーブル（shokupan/damuo/fuwafuwa/yuki/togetoge/piko）
- ディレクトリ構造（plugins/chollows/）
- 開発コマンド更新
- 重要な規約更新（Confidence スコア、disabled_agents）
**備考:** 既存の CLAUDE.md の構造・記述レベルに合わせる。

### 3-3: 全体整合性チェック (High)

**ファイル:** 全ファイル
**現状:** フェーズ 0〜2 で各ファイルを個別に変更
**目標:** 以下の整合性を確認し、不一致があれば修正:
- `plugin.json` の参照パスと実際のファイルパスの一致
- `action.yml` のパラメータと `entrypoint.sh` の環境変数の一致
- `SKILL.md` の agent ID と `agents/*.md` のファイル名の一致
- `README.md` の設定例と `action.yml` の実際のパラメータの一致
- 全ファイルから `devinu` / `DevInu` / `おやかた` / 旧犬名 の参照が除去されていること
**備考:** `grep -ri` で横断検索して漏れを検出。

---

## 検証ステップ

```bash
# DevInu 参照の完全除去確認（.claude/ と .git/ を除外）
grep -ri "devinu" --include="*.md" --include="*.yml" --include="*.json" --include="*.sh" --exclude-dir=".claude" --exclude-dir=".git" . || echo "OK: No DevInu references"

# 旧犬名の完全除去確認
grep -ri "おやかた\|moppu\|wataame\|beko\|wawachi\|chikuwa" --include="*.md" --include="*.yml" --include="*.json" --include="*.sh" --exclude-dir=".claude" --exclude-dir=".git" . || echo "OK: No old agent names"

# plugin.json の参照ファイルが全て存在すること
python3 -c "
import json, os
with open('plugins/chollows/plugin.json') as f:
    data = json.load(f)
for s in data.get('skills', []):
    path = 'plugins/chollows/' + s['path']
    assert os.path.exists(path), f'Missing: {path}'
for a in data.get('agents', []):
    path = 'plugins/chollows/' + a['path']
    assert os.path.exists(path), f'Missing: {path}'
print('OK: All plugin.json references exist')
"

# Docker ビルド最終確認
docker build -t chollows .
```

---

## 完了条件

- [ ] README.md が仕様書の構成に従い、6匹の情報・Quick Start・Configuration・Customization を含む
- [ ] CLAUDE.md が Chollows の情報で更新されている
- [ ] 全ファイルから `devinu` / `DevInu` / `おやかた` / 旧犬名の参照が除去されている（.claude/ ディレクトリを除く）
- [ ] plugin.json の参照パスが全て実在するファイルを指している
- [ ] action.yml のパラメータと entrypoint.sh の環境変数が一致している
- [ ] Docker ビルドが成功する

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| Docker ビルド成功 | `docker build -t chollows .` 終了コード 0 | ✅ |
| DevInu 参照完全除去 | `grep -ri "devinu"` が空（.claude/ 除外） | ✅ |
| 旧犬名完全除去 | `grep -ri "moppu\|wataame\|beko\|wawachi\|chikuwa"` が空（.claude/ 除外） | ✅ |
| plugin.json 参照の実在確認 | Python スクリプトで検証 | ✅ |
| README に Quick Start セクション | `grep "Quick Start" README.md` | ✅ |
| CLAUDE.md に Chollows 記述 | `grep "Chollows" CLAUDE.md` | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（feature-dev）
**スコープ:** 全変更ファイル（`git diff`）
**フォーカス:** ドキュメントの正確性、設定ファイル間の整合性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> テクニカルライティングと GitHub Actions の専門家として、フェーズ 3 の変更をレビューせよ:
> - README.md は初めて Chollows を使うユーザーにとって分かりやすいか？
> - Quick Start の設定例はコピー&ペーストで動作するか？
> - Configuration セクションのパラメータ説明は正確か？（action.yml と一致しているか）
> - CLAUDE.md は開発者が Chollows のコードベースを理解するのに十分か？
> - .chollows/ のカスタマイズ手順は明確か？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 3 のドキュメントと全体整合性を批判的にレビューせよ:
> - 全フェーズ（0〜3）を通じて、DevInu 時代の参照が完全に除去されているか？
> - plugin.json ↔ 実ファイル、action.yml ↔ entrypoint.sh、SKILL.md ↔ agent.md の3つの整合性は全て取れているか？
> - README のサンプル出力は SKILL.md の実際の出力フォーマットと一致しているか？
> - 設計書（design.md）の28要件が全て実装に反映されているか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** なし（最終フェーズ）
- **設計判断の背景:** ドキュメント更新を最終フェーズにしたのは、実装が確定してから正確なドキュメントを書くため。
- **既知の制限事項:** アイコン画像は未生成（別タスク）。README では当面絵文字で代替。
- **共有ユーティリティ:** なし。
