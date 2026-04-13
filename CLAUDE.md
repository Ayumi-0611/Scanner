# 伝票スキャナー — プロジェクト概要

次回修正時はこのファイルをClaudeに渡してください。すぐ作業に入れます。

---

## アプリの場所

| 場所 | URL |
|------|-----|
| アプリ本体（GitHub Pages） | https://ayumi-0611.github.io/Scanner/ |
| GitHubリポジトリ | https://github.com/Ayumi-0611/Scanner |
| GASプロジェクト | https://script.google.com/home/projects/1aDny7zm1h9-YysvRPicUMn4o_doksUAgbAk1CuVaeIuA5K9nhC8YiLxJ |
| スプレッドシート | https://docs.google.com/spreadsheets/d/1EaXbCgIR42ggOCAGCHo9sSsfbwWlZ8wPij4Pq6PEZRY |

---

## 構成

```
[スマホブラウザ]
    ↓ POST（no-cors）
[Google Apps Script ウェブアプリ]
    ↓
[Google Drive] 画像保存 + OCR
    ↓
[Google スプレッドシート] 結果書き込み
```

### ファイル構成（GitHub）

```
Scanner/
├── index.html       ← アプリ本体（HTML + JS + CSS 全部入り）
├── gas_code.gs      ← GASコードのバックアップ
├── apple-touch-icon.png
└── CLAUDE.md        ← このファイル
```

---

## GAS の設定値

```javascript
SHEET_ID    = '1EaXbCgIR42ggOCAGCHo9sSsfbwWlZ8wPij4Pq6PEZRY'
FOLDER_NAME = '伝票スキャナー画像'
HEADER_ROW  = 4

ORDER_COL   = 1   // A列: 注文番号
HAWB_COL    = 2   // B列: HAWB番号
TRACK_COL   = 6   // F列: 佐川急便 追跡番号
RATE_COL    = 7   // G列: 送料
DATE_COL    = 8   // H列: 発送日
IMG_COL     = 10  // J列: 画像URL（固定）

SHEETS = ['SG発送履歴','MY発送履歴','PH発送履歴','TW発送履歴','VN発送履歴','TH発送履歴']
```

---

## index.html の主要変数

```javascript
DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwubCwzaYNZwjQFvD2Uf4o1vfCQRem41KkZY_PpXETjjgDLSKTsCiMg6W7Zks5jNrfdkA/exec'
```

---

## GASを修正したときの手順

1. GASプロジェクトでコードを編集
2. 「デプロイ」→「デプロイを管理」→「編集（鉛筆）」→バージョンを「新しいバージョン」に変更→「デプロイ」
3. 新しいデプロイURLが発行されたら index.html の DEFAULT_GAS_URL を更新してGitHubにコミット
4. gas_code.gs も最新版に更新してコミット

## index.html を修正したときの手順

1. GitHubリポジトリの index.html を直接編集してコミット
2. GitHub Pagesが自動でリビルド（数分かかる場合あり）

---

## よくある修正パターン

| やりたいこと | 触るファイル |
|-------------|------------|
| 画面のデザイン・ボタン変更 | index.html |
| OCRの精度改善・抽出ロジック変更 | gas_code.gs（extractOrderId, extractTracking など） |
| 書き込む列を変える | gas_code.gs（定数部分） |
| 対応シートを追加 | gas_code.gs（SHEETS配列に追加） |
| アイコン変更 | apple-touch-icon.png をGitHubで差し替え |
