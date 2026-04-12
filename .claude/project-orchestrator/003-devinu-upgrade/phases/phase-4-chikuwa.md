# フェーズ 4: ちくわ（CI 分析）追加

**目的:** 新メンバー「ちくわ（ダックス）」の agent を作成し、CI 失敗時のみログを取得・分析する機能を追加する。おやかた（SKILL.md）にちくわの条件付き起動ロジックを追加する。

**ステータス:** 完了
**前提条件:** フェーズ 1 完了（ENABLE_CI_ANALYSIS 環境変数が利用可能）

**リスクレベル:** 中
**ロールバック:** chikuwa.md を削除し SKILL.md からちくわ起動ロジックを削除

---

## タスク

### 4-1: chikuwa.md 作成 (Critical)

**ファイル:** `plugins/devinu/agents/chikuwa.md`（新規）
**現状:** 存在しない
**目標:** 設計書 §5.4 に基づくちくわ agent が定義されている:
- Markdown frontmatter（name, description, tools 等）
- ロール: CI 失敗ログ分析担当のダックス犬エンジニア
- レビュー観点: ビルドエラー原因の特定、テスト失敗の根本原因分析、パイプライン設定の問題検出
- 出力フォーマット: 他の犬と同一（severity / file / line / title / description / suggestion）
- file / line が特定できない場合は省略可
- secrets がログに含まれる可能性を考慮し、具体的な値をコメントに転記しない
**備考:** 既存の agent（shokupan.md 等）のフォーマットに合わせる

### 4-2: おやかた（SKILL.md）にちくわの条件付き起動ロジック追加 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** 5 犬のみ並列起動
**目標:** 設計書 §6.1 に基づき、以下の条件でちくわを追加起動:
1. `ENABLE_CI_ANALYSIS` 環境変数が `true` であること
2. `gh api` で PR の head commit SHA に関連するワークフロー実行を取得
3. `conclusion == "failure"` の run_id が存在すること
4. `gh run view {run_id} --log-failed` で失敗ログを取得（10KB に truncate）
5. ちくわ agent をログ付きで起動
**備考:** ちくわは 5 犬の並列起動後に条件付きで追加起動する（設計書 §6.1 のシーケンス図参照）

### 4-3: ちくわの出力を統合パイプラインに追加 (High)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** 5 犬の結果のみ統合
**目標:** ちくわの出力も同一の統合パイプライン（重複排除→severity ソート→MIN_SEVERITY フィルタ→サイズチェック）で処理される
**備考:** ちくわが起動しなかった場合（CI 失敗なし or ENABLE_CI_ANALYSIS=false）は統計テーブルに「-（未実行）」と表示

### 4-4: 統計テーブルにちくわの行を追加 (Medium)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** 5 犬の統計テーブル
**目標:** ちくわの行が統計テーブルに含まれる（未実行時は「-」表示）
**備考:** 条件付き起動なので、常に 6 行表示されるがちくわの行はオプショナル

### 4-5: example-devinu.yml に enable_ci_analysis の設定例追加 (Medium)

**ファイル:** `.github/workflows/example-devinu.yml`（変更）
**現状:** enable_ci_analysis の使用例なし
**目標:** `with: enable_ci_analysis: "true"` の設定例がコメント付きで記載されている
**備考:** デフォルト false なので、明示的に有効化が必要であることを注記

---

## 検証ステップ

```bash
# chikuwa.md が存在し、frontmatter が含まれること
test -f plugins/devinu/agents/chikuwa.md && echo "chikuwa.md exists"
grep -i 'name:.*chikuwa\|ちくわ\|ダックス' plugins/devinu/agents/chikuwa.md && echo "chikuwa identity OK"

# SKILL.md に ENABLE_CI_ANALYSIS 参照があること
grep 'ENABLE_CI_ANALYSIS' plugins/devinu/skills/devinu-review/SKILL.md && echo "CI analysis toggle OK"

# SKILL.md に gh run 関連の記載があること
grep 'gh run' plugins/devinu/skills/devinu-review/SKILL.md && echo "gh run OK"

# SKILL.md にちくわ起動の記載があること
grep -i 'chikuwa\|ちくわ' plugins/devinu/skills/devinu-review/SKILL.md && echo "chikuwa in SKILL OK"

# chikuwa.md の出力フォーマットが他の犬と同一であること
grep 'severity' plugins/devinu/agents/chikuwa.md && echo "Output format OK"

# Docker ビルド確認
docker build -t devinu-test . && echo "Docker build OK"
```

---

## 完了条件

- [ ] `plugins/devinu/agents/chikuwa.md` が存在し、ダックス犬のアイデンティティが定義されている
- [ ] chikuwa.md の出力フォーマットが他の犬と同一（severity / file / line / title / description / suggestion）
- [ ] chikuwa.md に secrets 転記禁止の注意事項がある
- [ ] SKILL.md に `ENABLE_CI_ANALYSIS` の条件チェックがある
- [ ] SKILL.md に `gh api` でワークフロー実行の失敗判定ロジックがある
- [ ] SKILL.md に `gh run view {run_id} --log-failed` でログ取得の指示がある
- [ ] SKILL.md にログの 10KB truncate 指示がある
- [ ] 統計テーブルにちくわの行が追加されている（未実行時は「-」表示）
- [ ] Docker イメージがビルド可能

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| chikuwa.md 存在 | `test -f chikuwa.md` | ✅ |
| chikuwa.md フォーマット一致 | 他の犬 agent と比較レビュー | ✅ |
| ENABLE_CI_ANALYSIS 条件 | `grep ENABLE_CI_ANALYSIS SKILL.md` | ✅ |
| gh run ログ取得 | `grep 'gh run' SKILL.md` | ✅ |
| 10KB truncate | SKILL.md 内容レビュー | ✅ |
| secrets 転記禁止 | chikuwa.md 内容レビュー | ✅ |
| 統計テーブルにちくわ | SKILL.md 内容レビュー | ⚠️ 推奨 |
| Docker ビルド成功 | `docker build` 成功 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（pr-review-toolkit or feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff`）
**フォーカス:** chikuwa.md のフォーマット整合性、SKILL.md の条件分岐の正確性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> Claude Code Plugin Agent と GitHub Actions API の専門家として、フェーズ 4 の変更をレビューせよ:
> - chikuwa.md の frontmatter は Claude Code の agent 仕様に準拠しているか？（既存 agent と比較）
> - `gh run view --log-failed` の出力形式は期待通りか？truncate 方法は適切か？
> - ワークフロー実行の取得 API（`/actions/runs?event=pull_request&head_sha=...`）は正しいか？
> - ちくわの起動タイミング（5 犬の並列完了後 or 並列同時）は設計書と整合しているか？
> - `actions: read` 権限がフェーズ 1 で追加されていることの確認

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 4 のリグレッションと不足を批判的にレビューせよ:
> - 既存 5 犬の並列起動が影響を受けていないか？
> - ENABLE_CI_ANALYSIS=false（デフォルト）の場合、ちくわ関連のコードが一切実行されないことの確認
> - CI ログが 10KB を超える場合の truncate 方法は情報損失が最小になっているか？（先頭 vs 末尾 vs サマリー）
> - ちくわがエラーを返した場合のスキップ挙動（設計書 §8.3）は正しく実装されているか？
> - secrets がログに含まれていた場合の保護は十分か？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** なし（最終フェーズ）
- **設計判断の背景:** ちくわは CI 失敗時のみ起動するオプション機能。デフォルト無効（ENABLE_CI_ANALYSIS=false）にしてコスト増を防ぐ。
- **既知の制限事項:** `gh run view --log-failed` は GHE バージョンによってサポート状況が異なる可能性がある。
- **共有ユーティリティ:** ちくわの出力は他の犬と同一の統合パイプラインで処理される。新しい共有ユーティリティの追加はなし。
