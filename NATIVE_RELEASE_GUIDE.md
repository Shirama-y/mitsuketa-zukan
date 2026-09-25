# ネイティブアプリ配信ガイド

このブランチは `system-update-v2` を iOS / Android アプリとして配信するための土台です。

## アプリ情報

- 表示名：わたしの図鑑
- Bundle ID：`com.dodolabo.mitsuketazukan`
- Web bundle：`www/`
- Native runtime：Capacitor 8

Bundle ID は App Store Connect へ登録する前なら変更できます。

---

## 最初の1回だけ

Mac のターミナルで、このリポジトリを開きます。

### 1. Node.js を用意

Node.js の LTS版をインストールします。

### 2. 必要なものをインストール

```bash
npm install
```

成功すると `node_modules` が作られます。

### 3. iOSプロジェクトを作る

```bash
npm run native:ios:add
```

成功すると `ios/` フォルダができます。

### 4. Xcodeで開く

```bash
npm run native:ios:open
```

Xcode が起動します。

---

## 2回目以降

Web側を変更したら、次だけ実行します。

```bash
npm run native:ios:open
```

このコマンドは、

1. 最新のWebファイルを `www/` へコピー
2. iOSプロジェクトへ同期
3. Xcodeを開く

まで行います。

---

## Xcodeで最初に設定する場所

左側の青い **App** を選択します。

次に中央の **Signing & Capabilities** を開きます。

設定するもの：

- Team：Apple Developer Program のアカウント
- Bundle Identifier：`com.dodolabo.mitsuketazukan`
- Version：`1.0.0`
- Build：`1`

ここで赤いエラーが消えれば署名設定は成功です。

---

## 実機で確認

iPhoneをMacへ接続します。

Xcode上部の実行先で自分のiPhoneを選び、
左上の ▶ ボタンを押します。

確認する項目：

- 本棚が開く
- 新しい図鑑を作れる
- 写真を選べる
- 写真が保存される
- アプリを終了しても記録が残る
- デザインテーマを変更できる
- ボタンテーマが保存される
- バックアップを作れる

---

## TestFlight

実機確認後、Xcodeで

**Product → Archive**

を選びます。

Archive が成功したら Organizer から App Store Connect へアップロードします。

App Store Connect 上で TestFlight を有効にすると、
白間さんなどのテスターへ配布できます。

本番公開より先に、まず TestFlight で確認します。

---

## 本番公開前に追加するネイティブ機能

App Store審査で単なるWebサイトのラッパーに見えないよう、
次の機能を順番にネイティブ化します。

1. カメラ / 写真選択
2. 共有
3. 触覚フィードバック
4. バックアップファイルの保存 / 共有
5. ネイティブのステータスバー調整

既存のIndexedDBデータ設計は維持します。

---

## Android

Android Studioをインストール後、

```bash
npm run native:android:add
npm run native:android:open
```

でAndroid版も作れます。
