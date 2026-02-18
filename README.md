<!-- File: /README.md -->
# Draw & Dash（コインひろい）

子どもが描いたキャラでコインを集める、iPad向け静的Webゲームです。  
`/docs` 配下のみで動作し、GitHub Pages にそのまま公開できます。

## ファイル構成

- `docs/index.html`
- `docs/styles.css`
- `docs/app.js`
- `docs/assets/`

## ローカル起動

1. リポジトリルートで簡易サーバーを起動  
   - Python: `python -m http.server 8000`
2. ブラウザで `http://localhost:8000/docs/` を開く

## 使い方

1. 初回は自動で「おえかき」画面へ（キャラ保存が必須）
2. 色・太さ・消しゴムで描き、`できた！（保存して使う）` を押す
3. `スタート` でゲーム開始
4. 下の大きなボタンで操作  
   - `←` / `→` / `⤴`（ジャンプ）
5. コインで +10 点、障害物でミス +1、3ミスまたは時間切れで終了
6. ベストは難易度ごとに保存

## 保存仕様（localStorage）

- `playerDrawingPNG`：プレイヤー画像（96x96正規化PNG、Base64）
- `bestScore_{difficulty}`：難易度別ベストスコア
- `settings`：BGM / SE / 難易度 / プレイ時間

## GitHub Pages デプロイ手順（/docs 方式）

1. この構成を main ブランチへ push
2. GitHub リポジトリの `Settings` → `Pages`
3. `Build and deployment` の `Source` を `Deploy from a branch` に設定
4. Branch を `main`、Folder を `/docs` に設定して保存
5. 数分後に公開URLへアクセス

## iPad操作の注意

- おえかきキャンバス・ゲームキャンバス・操作ボタンは `touch-action: none` と `pointer` イベントで統一
- スクロールやピンチズームの誤作動を抑止
- Safari / Chrome（iPad）を想定

## 受け入れ基準セルフチェック

- [x] HTML/CSS/JS のみ（ビルド不要）
- [x] 1ページ内の画面切替（タイトル/おえかき/スタート前/ゲーム/リザルト/設定）
- [x] 初回はおえかき強制
- [x] 90秒デフォルト（60/90/120切替）
- [x] 3ミス終了
- [x] localStorage 3種保存
- [x] `requestAnimationFrame` ループ、`devicePixelRatio` 対応
- [x] pointer 操作統一・iPad向け誤動作対策
- [x] Undo最大20、消しゴム、全消し、保存
- [x] 難易度 Easy/Normal/Hard
- [x] ベスト更新演出（キラキラ + 音）
