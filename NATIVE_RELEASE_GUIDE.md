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


---

## 現在ネイティブ版に入っている機能

`native-app-v1` では、Web版に加えて次を実装しています。

- iPhoneカメラ / 写真ライブラリから直接写真を選択
- 写真登録後の成功ハプティクス
- お気に入り操作の軽いハプティクス
- 記録詳細からiOS共有シート
- バックアップをiOS共有シートへ渡す
- ネイビーのネイティブ起動画面
- ステータスバーを夜の図書館UIへ統一
- ネイティブ版ではGoogle Fontsを読み込まずオフライン動作
- iOSのカメラ / 写真ライブラリ権限文言を自動設定
- App Store用アイコン / スプラッシュ画像を自動生成

## 実機確認で見る順番

XcodeからiPhoneへ入れたら、次の順番だけ確認してください。

1. アプリを起動する
2. 本棚が表示される
3. 「新しい図鑑」を作る
4. 「新しく登録する」を押す
5. 「写真を撮る」または写真ライブラリを選ぶ
6. 写真を登録する
7. 保存時に軽い振動がある
8. お気に入りを押す
9. 詳細画面の「共有」を押す
10. マイページから「バックアップ」を押す
11. iOSの共有シートが出る
12. アプリを完全終了する
13. 再度開いて写真・図鑑が残っていることを確認する

## ここからApple Developerアカウントが必要

次の作業からはApple側のアカウントが必要です。

- 実機へ長期的にインストール
- TestFlight配布
- App Store Connect登録
- 本番App Store公開

Apple Developer Programへ加入後、
Xcodeの **Signing & Capabilities → Team** で加入したApple Accountを選択します。

コード側の準備とは別なので、
加入前でも現在のGitHub作業・シミュレータビルドまでは進められます。


## Web版からiPhoneアプリへ記録を移す

Web版とApp Store版は、iPhone上では保存領域が別になります。

そのため、Web版で作った図鑑がApp Store版へ自動で現れるわけではありません。

移行するときは次の順番です。

1. Safariで現在のWeb版を開く
2. 本棚の「バックアップ」を押す
3. JSONバックアップファイルを「ファイル」アプリなどへ保存
4. App Store版「わたしの図鑑」を開く
5. マイページ → 「復元」
6. 保存したJSONファイルを選ぶ
7. 図鑑・写真・記録が追加されたことを確認

復元は既存の図鑑を削除せず「追加」として行います。

App Store版への正式移行前には、必ずWeb版でバックアップを作成してください。
