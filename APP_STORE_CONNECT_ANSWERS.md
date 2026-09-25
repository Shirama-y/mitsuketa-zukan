# App Store Connect 初回登録 回答メモ

対象: わたしの図鑑 1.0.0  
Bundle ID: `com.dodolabo.mitsuketazukan`

この文書は `native-app-v1` の現行実装を基準にした初回登録用メモです。
App Store Connectの質問文が変わった場合は、実際の画面文言を優先して確認します。

---

## 1. 基本情報

- アプリ名: わたしの図鑑
- サブタイトル: 好きなものを、自分だけの図鑑に。
- 主言語: 日本語
- 主カテゴリ: ライフスタイル
- 副カテゴリ: 教育
- Version: 1.0.0
- SKU: mitsuketa-zukan-ios
- Bundle ID: com.dodolabo.mitsuketazukan
- Support URL: https://shirama-y.github.io/mitsuketa-zukan/support.html
- Privacy Policy URL: https://shirama-y.github.io/mitsuketa-zukan/privacy.html
- User Privacy Choices URL: 空欄で可（現行版はアカウント/サーバ保存なし）

## 2. App Privacy

現行版は次の仕様です。

- アカウント登録なし
- 広告SDKなし
- 解析SDKなし
- トラッキングなし
- 図鑑データは端末内保存
- 写真も図鑑登録のため端末内で使用
- 運営者サーバへの写真・図鑑データ送信なし

したがって現行実装のままなら、App Privacy開始画面では:

**「No, we do not collect data from this app（このアプリからデータを収集しません）」**

を選ぶ前提です。

注意:
今後クラウド同期、ログイン、分析、広告、問い合わせ送信などを追加した場合は回答を更新します。

## 3. Tracking

- App Tracking Transparency: 使用しない
- 他社アプリ/ウェブサイトをまたぐ追跡: なし
- IDFA利用: なし

## 4. カメラ / 写真

権限説明:

- Camera: 「図鑑に写真を登録するためにカメラを使用します。」
- Photo Library: 「図鑑に写真を登録するために写真ライブラリを使用します。」

写真アクセスはユーザーが登録操作をした時だけ使用します。

## 5. 年齢制限指定

現行アプリ自体に以下の機能・コンテンツはありません。

- ペアレンタルコントロール: なし
- 年齢確認: なし
- ユーザー生成コンテンツの公開/共有コミュニティ: なし
- メッセージ/チャット: なし
- 広告: なし
- 無制限のWebアクセス: なし
- ソーシャルメディア: なし
- 暴力表現: なし
- 武器表現: なし
- 性的表現/ヌード: なし
- 恐怖表現: なし
- 下品な言葉: なし
- アルコール/たばこ/薬物: なし
- 医療/治療情報: なし
- ギャンブル: なし
- 模擬ギャンブル: なし
- Loot Box: なし
- コンテスト: なし

基本的には各コンテンツ項目を **None / No** として回答する構成です。
Appleが算出したレーティングを確認し、Kidsカテゴリへの追加指定は初回では行いません。

※利用者自身が端末内へ登録する写真や自由記述は、アプリ運営側が公開・配信するUGC機能ではありません。

## 6. 輸出コンプライアンス / 暗号化

Info.plistには:

`ITSAppUsesNonExemptEncryption = false`

を設定済みです。

現行アプリ独自の暗号アルゴリズムは実装していません。
App Store Connect上では、質問の実際の文言を確認し、
非免除暗号を使用していない前提で回答します。

## 7. Content Rights

アプリ自体はユーザーが自分の写真・記録を端末内で整理するツールです。
初回提出時は、アプリ内に第三者配信コンテンツやストリーミング作品は含めません。

## 8. 広告識別子

- Advertising Identifier (IDFA): 使用しない

## 9. App Review Notes

審査担当者向けメモ案:

「わたしの図鑑」は、ユーザー自身が撮影または写真ライブラリから選択した画像とメモを、端末内に図鑑形式で保存するアプリです。アカウント登録は不要で、現行版ではデータを外部サーバへ送信しません。カメラおよび写真ライブラリへのアクセスは、ユーザーが図鑑へ写真を追加する操作を行った時のみ使用します。」

## 10. 初回審査前の最終確認

- [ ] App Store Connectのアプリレコード作成済み
- [ ] Bundle IDが com.dodolabo.mitsuketazukan
- [ ] Codemagic API integration名が dodolabo-appstore
- [ ] Distribution Certificate有効
- [ ] Provisioning Profile有効
- [ ] 署名済みIPAがApp Store Connectへアップロード済み
- [ ] 1290×2796スクリーンショット5枚を登録
- [ ] Support URLが開く
- [ ] Privacy Policy URLが開く
- [ ] App Privacy回答完了
- [ ] 年齢制限指定回答完了
- [ ] 輸出コンプライアンス回答完了
- [ ] TestFlight内部テスト完了
