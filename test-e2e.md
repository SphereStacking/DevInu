# E2E テスト用ダミーファイル

このファイルは DevInu アップグレード（Sticky コメント・インラインコメント・ちくわ CI 分析）の
E2E 動作確認のために作成されたテスト用 PR です。

## 確認項目

- [ ] GHCR の `:latest` イメージが pull できる
- [ ] Sticky コメント（`<!-- devinu-review-v1 -->` marker）が投稿される
- [ ] 5 犬 agent が並列起動してレビュー結果を返す
- [ ] 統計テーブルにちくわ行が「-（未実行）」で表示される
- [ ] MIN_SEVERITY=medium で Low が除外される

## テスト用コードサンプル

```javascript
// わざと指摘されそうなコード
const password = "hardcoded_secret_123";

function fetchData() {
  const items = [1, 2, 3];
  items.forEach(async (item) => {
    await fetch(`/api/${item}`);  // 逐次 await（並列化可能）
  });
}

export default function App() {
  return <div style={{color: "red"}}>{fetchData()}</div>
}
```
