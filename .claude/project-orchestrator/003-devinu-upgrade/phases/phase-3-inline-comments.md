# フェーズ 3: インラインコメント

**目的:** diff の特定行に suggestion 付きコメントを投稿する機能を追加する。ワンクリックで修正適用可能になり、レビュー体験が大幅に向上する。API エラー時は Sticky コメントにフォールバックして指摘が消えないようにする。

**ステータス:** 完了
**前提条件:** フェーズ 2 完了（Sticky コメント upsert が動作し、フォールバック先として利用可能）

**リスクレベル:** 高
**ロールバック:** SKILL.md のインラインコメント投稿ロジックを削除し、全指摘を Sticky コメントに戻す

---

## タスク

### 3-1: おやかた（SKILL.md）に diff position 計算ロジック追加 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** diff position の概念なし
**目標:** 設計書 §6.3 に基づき、おやかたが `gh pr diff` の出力をパースして各ファイルの diff position マップを構築する指示が記載されている:
- unified diff の `@@ -a,b +c,d @@` ヘッダーから position を計算
- ファイルパスと行番号から diff position への変換ロジック
- head commit SHA の取得方法（`gh pr view --json headRefOid`）
**備考:** diff position は unified diff 内の行オフセット（1 始まり）。@@ ヘッダーの直後が position=1。

### 3-2: インラインコメント投稿ロジック追加 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** インラインコメント機能なし
**目標:** 設計書 §3.3.4 に基づき、suggestion 付きインラインコメントを `gh api` で投稿する指示が記載されている:
```
gh api --hostname "$GHE_HOST" --method POST \
  /repos/{owner}/{repo}/pulls/{pull_number}/comments \
  -f body="..." -f commit_id="..." -f path="..." -F position=N
```
**備考:** body にはGitHub suggestion ブロック（` ```suggestion\n修正コード\n``` `）を含める

### 3-3: 同一行・複数犬指摘の統合ルール実装 (High)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** 統合ルールなし
**目標:** 設計書 §5.2 / REQ-01d に基づく統合ルールが SKILL.md に記載されている:
- 同一ファイル・同一行でも指摘内容が異なれば別々のインラインコメントとして投稿
- suggestion が競合する場合は severity が高い方をインラインコメントにし、残りは Sticky コメントに記載
**備考:** 「競合」とは同一行の同一コード範囲に異なる suggestion が付いている状態

### 3-4: インラインコメント 422 フォールバック実装 (Critical)

**ファイル:** `plugins/devinu/skills/devinu-review/SKILL.md`（変更）
**現状:** フォールバック機能なし
**目標:** 設計書 §8.2 に基づくフォールバック戦略が SKILL.md に記載されている:
1. POST /pulls/{n}/comments が 422 を返した場合、その指摘をフォールバックリストに移動
2. 全インラインコメント投稿後、フォールバックリストが空でなければ Sticky コメント末尾に追記
3. フォールバックセクション見出し: `### ⚠️ インライン投稿不可のため、ここに記載`
**備考:** position ズレは PR の再 push やforce push 後に発生しやすい

### 3-5: 各犬 agent の suggestion 出力対応 (High)

**ファイル:** `plugins/devinu/agents/shokupan.md`, `moppu.md`, `wataame.md`, `beko.md`, `wawachi.md`（変更）
**現状:** suggestion フィールドの出力フォーマットが不完全または未定義
**目標:** 各犬の出力フォーマットに suggestion フィールドが明確に定義され、GitHub suggestion ブロック形式で出力する指示がある
**備考:** 設計書 §5.3 の共通出力フォーマット:
```yaml
suggestion: |
  ```suggestion
  {修正後のコード}
  ```
```
suggestion がない指摘（設計観点のみの指摘等）は suggestion フィールドを省略可。

---

## 検証ステップ

```bash
# SKILL.md に diff position 関連の記載があること
grep -i 'position' plugins/devinu/skills/devinu-review/SKILL.md && echo "Position logic OK"

# SKILL.md にインラインコメント投稿の gh api 呼び出しがあること
grep 'pulls.*comments' plugins/devinu/skills/devinu-review/SKILL.md && echo "Inline comment API OK"

# SKILL.md に 422 フォールバック記載があること
grep -i 'fallback\|フォールバック' plugins/devinu/skills/devinu-review/SKILL.md && echo "Fallback OK"

# 各犬 agent に suggestion フォーマット記載があること
for agent in shokupan moppu wataame beko wawachi; do
  grep 'suggestion' plugins/devinu/agents/${agent}.md && echo "${agent}: suggestion OK"
done

# Docker ビルド確認
docker build -t devinu-test . && echo "Docker build OK"
```

---

## 完了条件

- [ ] SKILL.md に diff position 計算ロジック（unified diff パース）が記載されている
- [ ] SKILL.md に `gh api POST /pulls/{n}/comments` によるインラインコメント投稿指示がある
- [ ] SKILL.md に suggestion ブロック（` ```suggestion ` 形式）の投稿指示がある
- [ ] SKILL.md に同一行・複数犬指摘の統合ルールが記載されている
- [ ] SKILL.md に 422 エラー時の Sticky コメントへのフォールバック指示がある
- [ ] 5 犬の agent .md に suggestion 出力フォーマットが明記されている
- [ ] head commit SHA の取得方法が SKILL.md に記載されている
- [ ] Docker イメージがビルド可能

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| diff position 計算ロジック | SKILL.md 内容レビュー | ✅ |
| インライン投稿 gh api 記載 | `grep 'pulls.*comments' SKILL.md` | ✅ |
| suggestion ブロック形式 | SKILL.md 内容レビュー | ✅ |
| 422 フォールバック | `grep 'フォールバック' SKILL.md` | ✅ |
| 各犬 suggestion 対応 | 5 ファイルの `grep` 確認 | ✅ |
| GHE 対応（GH_HOSTNAME_ARGS） | インライン投稿コマンドに含まれるか | ✅ |
| Docker ビルド成功 | `docker build` 成功 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（pr-review-toolkit or feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff`）
**フォーカス:** SKILL.md の指示の正確性、agent .md のフォーマット整合性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> GitHub Pull Request Review Comments API と unified diff の専門家として、フェーズ 3 の変更をレビューせよ:
> - diff position の計算ロジックは GitHub API の仕様（unified diff の行オフセット）に準拠しているか？
> - `commit_id` は PR の head commit SHA を使用しているか？（merge commit SHA ではないか？）
> - suggestion ブロックの Markdown 構文は GitHub のレンダリング仕様と一致しているか？
> - 同一行・複数 suggestion の統合ルールは技術的に実現可能か？
> - フォールバック時の Sticky コメントへの追記で文字数制限（65,536）を超える可能性はないか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 3 のリグレッションと不足を批判的にレビューせよ:
> - フェーズ 2 で実装した Sticky コメントの upsert ロジックと矛盾していないか？
> - ローカルモードでインラインコメント投稿が試行されないか？（CI モード限定であることの確認）
> - diff position 計算は改行コード（CR/LF vs LF）の違いに影響されないか？
> - 大量のインラインコメント（50+）を投稿した場合の API レート制限は考慮されているか？
> - agent .md の suggestion フォーマット変更により、既存の出力指示との矛盾は発生していないか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** おやかたがインラインコメントを投稿可能であること。ちくわの出力も同じ統合・投稿パイプラインで処理される。
- **設計判断の背景:** インラインコメントは Sticky コメント（フェーズ 2）をフォールバック先として依存する。そのためフェーズ 2 → 3 の順序が必須。
- **既知の制限事項:** diff position の計算精度は GitHub の diff format に依存。force push 直後は position がズレやすい（フォールバックで救済）。
- **共有ユーティリティ:** suggestion 出力フォーマットは全犬で共通。ちくわ（フェーズ 4）も同一フォーマットを使用。
