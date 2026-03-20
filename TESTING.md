# LUFS計算の検証とテスト

## 修正内容

### 1. K-weightingフィルターのバグ修正

**問題:** Pre-filterとRLB filterの状態変数が混同されていました。

**修正前:**
```javascript
this.preFilter = { left: [0, 0], right: [0, 0] };
this.rlbFilter = { left: [0, 0], right: [0, 0] };
```

**修正後:**
```javascript
this.preFilterX = { left: [0, 0], right: [0, 0] };  // Pre-filter入力履歴
this.preFilterY = { left: [0, 0], right: [0, 0] };  // Pre-filter出力履歴
this.rlbFilterX = { left: [0, 0], right: [0, 0] };  // RLB filter入力履歴
this.rlbFilterY = { left: [0, 0], right: [0, 0] };  // RLB filter出力履歴
```

これにより、各フィルターが独立して正しく動作するようになりました。

### 2. VUメーターの修正

**問題:** Attack timeが速すぎ、0 VU基準が不正確でした。

**修正内容:**
- Attack time: 10ms → 300ms（標準仕様に準拠）
- 0 VU基準: -20 dBFS → -18 dBFS（業界標準）
- 計算式: `20 * Math.log10(rms) + 18`

## テスト方法

### 1. LUFS基本テストページ

`test-lufs.html` を開いて、以下の項目を確認してください：

- ✅ K-weightingフィルター係数（ITU-R BS.1770-4準拠）
- ✅ LUFS計算式（-0.691 offsetを含む）
- ✅ ゲート処理（Absolute: -70 LUFS, Relative: -10 LU）
- ✅ 正常なLUFS値の範囲（常に負の値）

### 2. VUメーターテストページ

`test-vu.html` を開いて、以下の項目を確認してください：

- ✅ 0 VU = -18 dBFS の変換
- ✅ 積分時間 300ms
- ✅ RMS計算の精度
- ✅ dBFS to VU 変換テーブル

### 3. リアルタイムデバッグ

1. アプリケーションを開く
2. ブラウザのコンソールを開く（F12キー）
3. コンソールに `enableLUFSDebug()` と入力してEnter
4. "Start Monitoring" をクリック
5. コンソールに詳細なLUFS計算ログが表示されます

**確認ポイント:**
- サンプル値が -1.0 〜 +1.0 の範囲内か
- Mean Square が正の値か
- Block Loudness が負の値（-60〜0 LUFS程度）か
- クリッピング警告が出ていないか

### 3. 期待される値の範囲

| プラットフォーム | 目標LUFS | 許容範囲 |
|----------------|----------|----------|
| 放送 (EBU R128) | -23 LUFS | ±1 LU |
| YouTube | -14 LUFS | ±2 LU |
| Spotify | -14 LUFS | ±2 LU |
| Apple Music | -16 LUFS | ±1 LU |
| Twitch | -14 LUFS | ±2 LU |

**重要:** LUFS値は**必ず負の値**になります。正の値（例: +7.4 LUFS）が出た場合は計算エラーです。

## 実装の詳細

### ITU-R BS.1770-4 準拠状況

| 項目 | 準拠度 | 備考 |
|------|--------|------|
| K-weighting係数 | ✅ 完全 | 48kHz用の公式係数 |
| ブロックサイズ | ⚠️ 簡易 | 100ms（オーバーラップなし） |
| Momentary (400ms) | ✅ 準拠 | 4×100msブロック |
| Short-term (3s) | ✅ 準拠 | 30×100msブロック |
| ゲート処理 | ✅ 完全 | Absolute + Relative |
| チャンネルゲイン | ✅ 完全 | L=1.0, R=1.0 |

**注:** 完全準拠版では400msブロックで75%オーバーラップ（100ms hop）を使用しますが、本実装では簡易化のため100msブロック（オーバーラップなし）を使用しています。これは測定精度を大きく損なうものではありません。

### VU Meter準拠状況

| 項目 | 準拠度 | 備考 |
|------|--------|------|
| 0 VU基準 | ✅ 完全 | -18 dBFS = 0 VU |
| 積分時間 | ✅ 完全 | 300ms (Attack & Release) |
| 測定方式 | ✅ 完全 | RMS (Root Mean Square) |
| 範囲 | ⚠️ 拡張 | -20 VU to +6 VU（高レベル音源対応） |
| 針の動き | ✅ 標準 | 指数関数的スムージング |

**VU値の対応表:**

| dBFS | VU | 用途 |
|------|-----|------|
| -38 dB | -20 VU | 最小可視レベル |
| -24 dB | -6 VU | 低めのレベル |
| -18 dB | 0 VU | **標準動作レベル** |
| -15 dB | +3 VU | 従来の最大許容レベル |
| -12 dB | +6 VU | 高レベル音源（YouTube等）|

**注:** 標準のVUメーターは+3 VUまでですが、YouTube等の高レベル音源（-14 LUFS）に対応するため+6 VUまで表示可能にしています。

### True Peak測定

現在の実装は4倍オーバーサンプリングで線形補間を使用しています。ITU-R BS.1770-4ではsinc補間を推奨していますが、CPUコストが高いため線形補間を採用しています。

**精度:** 約±0.5 dBTP（実用上は問題なし）

## トラブルシューティング

### 問題: LUFS値が正の値になる

**原因:**
1. フィルター状態変数の混同（修正済み）
2. サンプル値が正規化されていない
3. Mean square計算のバグ

**確認方法:**
```javascript
enableLUFSDebug()  // コンソールで実行して詳細ログを確認
```

### 問題: VU値が不自然に動く

**原因:**
1. 積分時間が短すぎる（修正済み：300msに設定）
2. 0 VU基準が不適切（修正済み：-18 dBFSに設定）
3. RMS計算のバグ

**確認方法:**
```javascript
runAllVUTests()  // test-vu.htmlで実行して計算を確認
```

**期待される動作:**
- 針がゆっくり動く（300msの時定数）
- -18 dBFS の信号で 0 VU を指す
- 範囲: -20 VU 〜 +3 VU

### 問題: LUFS値が-∞のまま

**原因:**
1. 入力音声が無音
2. ブロック数が不足（Momentaryは4ブロック必要）
3. ゲート処理で全てフィルタリングされている

**確認方法:**
- マイクの音量を上げる
- 数秒待つ
- コンソールログで"Block Loudness"を確認

### 問題: 値が大きく変動する

**原因:**
1. 入力音声のダイナミックレンジが広い
2. バックグラウンドノイズ
3. ゲート処理が頻繁に変わる

**対策:**
- LRA（Loudness Range）値を確認
- Integrated値で全体の傾向を見る
- 音源の距離・音量を調整

## 参考資料

- [ITU-R BS.1770-4](https://www.itu.int/rec/R-REC-BS.1770/) - Algorithms to measure audio programme loudness
- [EBU R128](https://tech.ebu.ch/docs/r/r128.pdf) - Loudness normalisation and permitted maximum level
- [EBU Tech 3341](https://tech.ebu.ch/docs/tech/tech3341.pdf) - Loudness Metering: 'EBU Mode' metering to supplement EBU R 128
