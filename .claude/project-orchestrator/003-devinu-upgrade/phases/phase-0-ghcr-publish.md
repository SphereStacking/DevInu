# フェーズ 0: Docker イメージ GHCR 配布

**目的:** Docker イメージを GHCR に自動ビルド・push する CI ワークフローを作成し、action.yml を GHCR 参照に変更する。これにより利用者は毎回 Docker ビルドが不要になる。

**ステータス:** 完了
**前提条件:** なし

**リスクレベル:** 低
**ロールバック:** docker-publish.yml を削除し action.yml の image を `Dockerfile` に戻す

---

## タスク

### 0-1: docker-publish.yml 作成 (Critical)

**ファイル:** `.github/workflows/docker-publish.yml`（新規）
**現状:** 存在しない
**目標:** main ブランチ push 時 or セマンティックバージョンタグ作成時に GHCR へ自動ビルド・push されるワークフローが存在する
**備考:** 設計書 §6.4, §7.2 の内容に従い作成。以下の構成:
```yaml
name: Docker Publish
on:
  push:
    branches: [main]
    tags: ["v*.*.*"]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/spherestacking/devinu
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
```

### 0-2: action.yml の image を GHCR 参照に変更 (Critical)

**ファイル:** `action.yml`（変更）
**現状:** `image: Dockerfile`（毎回ビルド）
**目標:** `image: docker://ghcr.io/spherestacking/devinu:latest`（GHCR から pull）
**備考:** `runs.using: docker` は変更しない。`runs.image` のみ変更。

### 0-3: example-devinu.yml の更新 (Medium)

**ファイル:** `.github/workflows/example-devinu.yml`（変更）
**現状:** inputs 設定例なし
**目標:** GHCR から pull する動作であることがコメントで明記されている
**備考:** ワークフローの動作自体は変わらない。利用者向けのドキュメント的な変更。

---

## 検証ステップ

```bash
# docker-publish.yml の YAML 構文確認
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml'))" && echo "YAML OK"

# action.yml の image が GHCR を指していること
grep 'docker://ghcr.io/spherestacking/devinu' action.yml && echo "GHCR ref OK"

# Docker イメージがローカルでビルドできること（既存 Dockerfile の破損がないか）
docker build -t devinu-test . && echo "Docker build OK"
```

---

## 完了条件

- [ ] `.github/workflows/docker-publish.yml` が有効な YAML であり、GHCR への push 設定が含まれる
- [ ] `action.yml` の `image` が `docker://ghcr.io/spherestacking/devinu:latest` になっている
- [ ] 既存の `Dockerfile` がビルド可能であること（破壊していない）
- [ ] docker-publish.yml に `permissions: packages: write` が設定されている

---

## Go/No-Go チェックリスト

| 項目 | 検証方法 | 必須 |
|------|---------|------|
| docker-publish.yml が有効な YAML | `python3 -c "import yaml; ..."` 終了コード 0 | ✅ |
| action.yml が GHCR 参照 | `grep 'docker://ghcr.io'` | ✅ |
| Dockerfile がビルド可能 | `docker build` 成功 | ✅ |
| タグ戦略に semver + latest が含まれる | docker-publish.yml の tags セクション確認 | ✅ |
| permissions に packages: write | YAML 内に記載 | ✅ |

---

## レビュー（実装完了後に実行）

実装完了後に3つのレビューエージェントを全て**並列起動**する。

### レビュー 1: コードレビュー
**エージェント:** `code-reviewer`（pr-review-toolkit or feature-dev）
**スコープ:** このフェーズで変更された全ファイル（`git diff`）
**フォーカス:** YAML 構文、GitHub Actions の構成、セキュリティ

### レビュー 2: 専門家レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> GitHub Actions と GHCR の専門家として、フェーズ 0 の変更をレビューせよ:
> - `docker-publish.yml` は GitHub Actions のベストプラクティスに準拠しているか？
> - `docker/metadata-action` の tags 設定は semver パターンとして正しいか？
> - `docker/build-push-action` のキャッシュ設定は不要か？（ビルド頻度が低いため省略可能か判断）
> - action.yml の `image: docker://...` 形式は GitHub Actions の Docker action 仕様に準拠しているか？
> - GHCR への push 権限（packages: write）が最小権限の原則に従っているか？

### レビュー 3: 批判的レビュー
**エージェント:** `Explore` サブエージェント
**プロンプト:**
> フェーズ 0 のリグレッションと不足を批判的にレビューせよ:
> - action.yml の image 変更により、既存ユーザーのワークフローが壊れないか？
> - GHCR のイメージが存在しない状態で action.yml を先にリリースした場合の挙動は？
> - docker-publish.yml の on.push.branches と on.push.tags の同時指定は意図通りに動作するか？
> - Dockerfile の COPY パスや ENTRYPOINT がイメージに正しく含まれるか？

---

## 次フェーズへの引き継ぎ

- **後続フェーズが前提とする契約:** GHCR に `ghcr.io/spherestacking/devinu:latest` が push 可能な CI が存在すること。action.yml が GHCR からイメージを pull すること。
- **設計判断の背景:** Docker 毎回ビルドは CI 実行時間の浪費。GHCR に pre-built イメージを配布することで pull のみになり高速化する。
- **既知の制限事項:** 初回の GHCR push は手動 or main マージ後に実行が必要。イメージが存在しない状態では action.yml がエラーになる。
- **共有ユーティリティ:** なし。
