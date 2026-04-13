# フェーズ 2: Agent Prompts

**目的:** 6匹のお化け動物 agent.md を新規作成/再設計する。各 agent に Confidence スコア・4段階レビュープロセス・専門チェックパターンを実装し、設計書の出力フォーマットに準拠させる。

**ステータス:** 未開始
**前提条件:** フェーズ 0 完了（agents/ ディレクトリが存在すること）

**リスクレベル:** 中
**ロールバック:** `git checkout plugins/chollows/agents/` で元に戻す。

---

## タスク

### 2-1: 共通プロンプト設計（全 agent 共通部分の定義） (Critical)

**ファイル:** 全 agent.md に反映
**現状:** なし
**目標:** 全 agent に共通する以下の要素を定義:
- 出力フォーマット（severity/file/line/title/description/confidence/suggestion）
- Confidence スコアの付与基準（0-25: 誤検知、26-50: nitpick、51-75: 低影響、76-90: 要対応、91-100: クリティカル）
- 4段階レビュープロセス（1.対象特定 → 2.パターン検出 → 3.評価 → 4.出力）
- 文体指定（敬体「〜です / 〜ます」、性格バイアスなし、キャラ性はアイコンと名前のみ）(REQ-017, REQ-018)
- disabled_agents チェック（自身の ID が含まれていれば即返す）
- rules.md 準拠指示（存在する場合、ルール違反を最優先で検出）(REQ-026)
- 「指摘なし」の場合の出力形式
- secrets 発見時の全文引用禁止（REQ-023）
**備考:** この共通部分を各 agent.md の冒頭に配置する。既存の agent（shokupan.md 等）のパターンを参考にしつつ、Confidence スコアと4段階プロセスを追加。

### 2-2: shokupan.md — Frontend agent (High)

**ファイル:** `plugins/chollows/agents/shokupan.md`
**現状:** プレースホルダ
**目標:** コーギー「しょくぱん」🐕 の Frontend レビュー agent を実装。
- 担当: UI/a11y/CSS/React/Vue
- チェックパターン: 不要な再レンダリング / aria 属性漏れ / CSS スコープ漏れ / バンドルサイズ増大 / XSS (dangerouslySetInnerHTML) / バンドル未最適化インポート
- フロントエンド固有のセキュリティ観点（XSS）もカバー
**備考:** 既存の `plugins/devinu/agents/shokupan.md` を参考に、Confidence スコアと4段階プロセスを追加して再設計。

### 2-3: damuo.md — Architecture & Code Quality agent (High)

**ファイル:** `plugins/chollows/agents/damuo.md`
**現状:** プレースホルダ
**目標:** ビーバー「だむお」🦫 の Architecture & Code Quality レビュー agent を新規作成。
- 担当: 設計/可読性/命名/DRY/Error Handling
- チェックパターン: 深いネスト / 単一責任原則違反 / 空の catch ブロック / DRY 違反 / 命名の不明瞭さ / 循環参照
- 定量評価: 設計品質スコア
**備考:** 旧 DevInu には直接の対応 agent がない新規 agent。pr-review-toolkit の code-reviewer と silent-failure-hunter の観点を吸収。

### 2-4: fuwafuwa.md — Docs / Types / API agent (High)

**ファイル:** `plugins/chollows/agents/fuwafuwa.md`
**現状:** プレースホルダ
**目標:** チンチラ「ふわふわ」🐹 の Docs/Types/API レビュー agent を実装。
- 担当: 型定義/ドキュメント/API契約
- チェックパターン: `any` 型の使用 / JSDoc 欠落 / API 契約の不整合 / 型の過度な widening / export 定義の欠落
- 定量評価: 型設計の4軸評価（Encapsulation / Expression / Usefulness / Enforcement）
**備考:** 旧 wawachi.md を参考に再設計。pr-review-toolkit の type-design-analyzer と comment-analyzer の観点を吸収。

### 2-5: yuki.md — Performance & Data agent (High)

**ファイル:** `plugins/chollows/agents/yuki.md`
**現状:** プレースホルダ
**目標:** シマエナガ「ゆき」🐦 の Performance & Data レビュー agent を実装。
- 担当: N+1/計算量/メモリ/クエリ/インデックス/バンドルサイズ
- チェックパターン: N+1 クエリパターン / 逐次 await の並列化可能箇所 / O(n²) アルゴリズム / メモリリーク / バンドルサイズ増大
- フロントエンド固有のパフォーマンス観点（バンドルサイズ）もカバー
**備考:** 旧 wataame.md を参考に再設計。

### 2-6: togetoge.md — Security agent (High)

**ファイル:** `plugins/chollows/agents/togetoge.md`
**現状:** プレースホルダ
**目標:** ハリネズミ「とげとげ」🦔 の Security レビュー agent を実装。
- 担当: 脆弱性/secrets/認証/XSS/CSRF
- チェックパターン: ハードコードされた secrets / SQL インジェクション / XSS / CSRF トークン欠落 / 認証チェック漏れ / 安全でない乱数
- secrets 発見時は全文を引用しない（事実のみ報告）(REQ-023)
- フロントエンド固有のセキュリティ観点もカバー
**備考:** 旧 moppu.md を参考に再設計。pr-review-toolkit の silent-failure-hunter の観点も吸収。

### 2-7: piko.md — Test Quality agent (High)

**ファイル:** `plugins/chollows/agents/piko.md`
**現状:** プレースホルダ
**目標:** メンダコ「ぴこ」🐙 の Test Quality レビュー agent を実装。
- 担当: カバレッジ/テスト妥当性
- チェックパターン: テストのない新規関数 / 境界値テスト欠落 / モックが過剰でテスト価値ゼロ / `it('should work')` 等の意味のないテスト名
- 定量評価: 各テスト提案に criticality レーティング（1-10）
**備考:** 旧 beko.md を参考に再設計。pr-review-toolkit の pr-test-analyzer の観点を吸収。

---

## 検証ステップ

```bash
# 全 agent ファイルの存在確認
for agent in shokupan damuo fuwafuwa yuki togetoge piko; do
  test -f "plugins/chollows/agents/${agent}.md" && echo "OK: ${agent}.md" || echo "MISSING: ${agent}.md"
done

# 各 agent が Confidence スコアに言及していること
for agent in shokupan damuo fuwafuwa yuki togetoge piko; do
  grep -qi "confidence" "plugins/chollows/agents/${agent}.md" && echo "OK: ${agent} has confidence" || echo "MISSING: ${agent} confidence"
done

# 各 agent が出力フォーマットを定義していること
for agent in shokupan damuo fuwafuwa yuki togetoge piko; do
  grep -q "severity" "plugins/chollows/agents/${agent}.md" && echo "OK: ${agent} has severity format" || echo "MISSING: ${agent} severity"
done

# Docker ビルドが引き続き成功すること
docker build -t chollows .
```

---

## 完了条件

- [ ] 6つの agent.md が全て空でなく実質的な内容を持つ
- [ ] 全 agent が共通出力フォーマット（severity/file/line/title/description/confidence/suggestion）に準拠している
- [ ] 全 agent が Confidence スコアの付与基準を含んでいる
- [ ] 全 agent が4段階レビュープロセスを含んでいる
- [ ] 全 agent が敬体指定と性格バイアス排除の文体ルールを含んでいる
- [ ] 各 agent が設計書セクション5のチェックパターンをカバーしている
- [ ] togetoge が secrets 全文引用禁止ルールを含んでいる
- [ ] Docker ビルドが成功する

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| Docker ビルド成功 | `docker build -t chollows .` 終了コード 0 | ✅ |
| 6 agent ファイル全て存在 | `ls plugins/chollows/agents/*.md` で6ファイル | ✅ |
| 全 agent に Confidence スコア定義あり | 各ファイルを `grep "confidence"` | ✅ |
| 全 agent に出力フォーマット定義あり | 各ファイルを `grep "severity"` | ✅ |
| 全 agent に文体ルールあり | 各ファイルを `grep "です\|ます"` | ✅ |
| DevInu 時代の agent 名が残っていない | `grep -r "moppu\|wataame\|beko\|wawachi" plugins/chollows/agents/` が空 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（feature-dev）
**スコープ:** `plugins/chollows/agents/` 配下の全変更（`git diff`）
**フォーカス:** プロンプトの品質、チェックパターンの網羅性、出力フォーマットの一貫性

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> LLM プロンプトエンジニアリングの専門家として、フェーズ 2 の6つの agent.md をレビューせよ:
> - 各 agent のチェックパターンは具体的かつ実行可能か？（「コード品質をチェックせよ」のような曖昧な指示ではなく、具体的なアンチパターンが列挙されているか）
> - Confidence スコアの付与基準は LLM が一貫して適用できるほど明確か？
> - 4段階プロセスの各ステップは十分に具体的か？
> - 6 agent 間で担当観点の重複や抜け漏れはないか？
> - agent 出力フォーマットは SKILL.md（フェーズ 1）が期待する形式と完全に一致しているか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 2 の agent.md のリグレッションと不足を批判的にレビューせよ:
> - 設計書セクション5のチェックパターン一覧と比較して、欠落しているパターンはないか？
> - pr-review-toolkit の優れた設計要素（Confidence スコア、段階的プロセス、定量評価）が適切に吸収されているか？
> - 「指摘なし」の場合の出力が SKILL.md の結果統合ステップで正しく処理されるか？
> - disabled_agents チェックが全 agent に一貫して実装されているか？
> - secrets 全文引用禁止が togetoge だけでなく、他の agent にも適切に注意喚起されているか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** 6つの agent.md が確定し、SKILL.md から参照可能。出力フォーマットが統一されている。
- **設計判断の背景:** 共通部分を各 agent.md に直接記述する方式を採用（共有テンプレートファイルではなく）。これは Claude Code プラグインが agent.md 単体で完結する必要があるため。
- **既知の制限事項:** Confidence スコアの精度は運用開始後に評価・調整が必要（M-003）。
- **共有ユーティリティ:** なし（各 agent は独立）。
