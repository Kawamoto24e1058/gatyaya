# ガチャ屋の借金返済（仮題）

借金を抱えたガチャ屋の店主が、ガチャを回して出た景品を変動する相場で売り、借金を返していくローグライト。
現在は **Phase 1（手触りの検証）** の実装です。

## 動かし方

```bash
npm install
npm run dev      # http://localhost:5173 （--host 付きなので同じ LAN のスマホからも開けます）
npm run build    # dist/ に出力
npm run preview  # ビルド成果物の確認
```

Node.js は 20.19 以上（または 22.12 以上）が必要です（Vite 8 の要件）。

## Cloudflare Pages へのデプロイ

ダッシュボードで GitHub リポジトリを接続し、次のように設定します。

| 項目 | 値 |
|---|---|
| Framework preset | なし（None） |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 環境変数 | `NODE_VERSION=22` |

CLI から直接アップロードする場合：`npm run build && npx wrangler pages deploy dist`

## 技術構成

- TypeScript + Vite + Phaser 3（Matter.js 物理）
- 効果音は `src/core/audio.ts` で **すべてコード合成**（外部音源なし）。起動時に AudioBuffer を作り、`pointerdown` から即時再生
- 画像はすべて Canvas で生成（`src/ui/textures.ts`）、フォントは端末のシステムフォント
- 保存は localStorage（すべて try/catch）

## ディレクトリ

```
src/
  config.ts              画面サイズ・バランス定数（仮値）
  core/audio.ts          Web Audio 効果音エンジン（合成）
  core/util.ts           抽選・数値表記（万/億/兆）・振動
  data/                  レア度・景品(30種)・ガチャ機の定義
  game/state.ts          ゲーム状態・日/週の進行・返済・保存
  game/market.ts         相場（トレンド＋飽和）と売値計算
  game/relics.ts         レリックのフック機構（Phase 2 で中身を追加）
  game/Capsule.ts        瓶の中の物理カプセル
  machines/              ガチャ機の操作ビュー（機種ごとに登録）
  minigames/             バイト（MiniGame インターフェース＋登録）
  scenes/                Boot / Shop / Market / Baito / Close / Payday / GameOver
  ui/                    HUD・ボタン・テクスチャ生成
```

## 拡張ポイント

- **ガチャ機を追加**：`data/machines.ts` に定義を追加し、操作方式が新しければ `machines/` にビューを作って `registerMachineView()` で登録
- **バイトを追加**：`MiniGame` を実装し、`minigames/registry.ts` に 1 件追加
- **レリックを追加**：`game/relics.ts` の `RELICS` に `hooks`（`onSellPrice` など）を持つ定義を追加。所持順にかけ算で連鎖適用されます

## Phase 1 で実装したもの

- 手回し式ガチャ：ハンドルを指で回す（30° ごとに「ガリ」、1 周で「ゴトン」＋画面揺れ＋煙）。逆回転は無効（ラチェット）
- カプセルの物理と合体（N→R→SR→SSR→UR、同じレア度が接触で合体、連鎖で音程が上がる）、瓶の容量 20
- 開封演出（レア度が高いほど溜め・揺れ・光が大きい）
- 景品 30 種（架空 3 シリーズ × 5 レア度 × 2 種）
- 相場：シリーズごとのトレンド（通常/ブーム/飽き）と景品ごとの飽和（1 個売るごとに ×0.92、毎日 50% 回復）
- 売却画面（記号で値動き表示、数値は景品タップ時のみ）
- バイト「カプセル詰め」（20 個以上で瓶容量 +1／今週のみ）
- 1 日 6AP、閉店のレジ締め演出、7 日ごとの返済、ゲームオーバー、localStorage 保存/再開

## 仕様から判断した点（要確認）

- **出店の AP**：「売りに行く」は入るたびに 1AP。戻ると店じまい（1 日 1 回扱いにするかは未確定、`MarketScene.ts` に TODO）
- **AP 0 のとき**：自動閉店にはせず、ガチャ（AP 不要）と開封は続けられる。閉店ボタンが点滅して促す
- **閉店の誤操作防止**：AP が残っている場合は 2 回押しで閉店
- **バランス**：初期コイン 150、ガチャ 1 回 20、景品基準価格 N10/R26/SR68/SSR180/UR480 など、すべて仮値（`config.ts` / `data/`）

## 未実装・TODO（コード内に `TODO(...)` で記載）

- Phase 2：イベント・噂・倉庫上限・レリック 12 種とショップ・バイト追加・レバー式ガチャ
- Phase 3：10 連タワー・巨大ガチャ・エリア拡大・町ごとの相場差・町の移動
- 未決事項：正式タイトル、画風の詳細、数値バランス
- 縦長スマホ（19.5:9 など）では上下に余白が出る（9:16 固定の FIT 表示）
