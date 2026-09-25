# Macなしで iPhone アプリを TestFlight へ出す手順

このプロジェクトは、Macを持っていなくても Codemagic のクラウドMacで
iOSアプリを署名・ビルド・App Store Connectへアップロードできる構成です。

## 必要なもの

1. Apple Account
2. Apple Developer Program
3. App Store Connect のアプリ登録
4. Codemagic アカウント
5. GitHub のこのリポジトリ

ローカルMacは不要です。

---

# 1. Apple Developer Programへ加入

iPhoneの「Apple Developer」アプリから個人登録することもできます。

KASC名義など、組織名をApp Storeの販売元として表示したい場合は、
Apple Developer Programを「Organization」で登録する必要があります。

## KASCが非営利法人として申請する場合

Appleには対象の非営利団体などに対する
Developer Programの年会費免除制度があります。

条件に該当する場合は、加入時に確認してください。

---

# 2. App Store Connectでアプリを作る

ブラウザで App Store Connect を開きます。

「マイApp」→「＋」→「新規App」。

入力の目安：

- プラットフォーム：iOS
- 名前：わたしの図鑑
- 主言語：日本語
- Bundle ID：com.dodolabo.mitsuketazukan
- SKU：mitsuketa-zukan-ios

ここで作成しただけでは公開されません。

---

# 3. App Store Connect APIキーを作る

App Store Connectで

「ユーザとアクセス」
→「統合」
→「App Store Connect API」
→「チームキー」

へ進みます。

「＋」を押し、

- 名前：DODOLABO Codemagic
- アクセス：App Manager

で作成します。

必要になる3つ：

- Issuer ID
- Key ID
- AuthKey_XXXXXXXXXX.p8

.p8 は一度しかダウンロードできないため、安全な場所へ保存してください。

このファイルをGitHubには絶対にアップロードしません。

---

# 4. CodemagicへGitHubを接続

Codemagicへログインします。

「Add application」
→ GitHub
→ Shirama-y/mitsuketa-zukan

を選択します。

使用するブランチ：

native-app-v1

設定ファイル：

codemagic.yaml

---

# 5. Apple連携をCodemagicへ追加

Codemagicの

Team settings
→ Integrations
→ Developer Portal

でApp Store Connect APIキーを登録します。

このプロジェクトの codemagic.yaml は

dodolabo-appstore

という連携名を使用します。

Codemagic側のAPIキー名も必ず
「dodolabo-appstore」にしてください。

入力：

- Issuer ID
- Key ID
- .p8 ファイル

---

# 6. 配布証明書とProvisioning Profile

Codemagicの

Team settings
→ Code signing identities

からApple Distribution証明書を用意します。

App Store Connect連携を使って
Codemagic上で新しいApple Distribution証明書を生成できます。

次に App Store用 Provisioning Profile を
Bundle ID

com.dodolabo.mitsuketazukan

に対して用意します。

codemagic.yamlは次の条件の署名ファイルを自動取得します。

- distribution_type: app_store
- bundle_identifier: com.dodolabo.mitsuketazukan

---

# 7. Codemagicでビルド

Codemagicで

「Start new build」

を押します。

Workflow：

iOS TestFlight - Macなし配信

Branch：

native-app-v1

を選択します。

成功すると、

- 署名済みIPA
- dSYM
- Xcodeビルドログ

が作成されます。

さらにApp Store ConnectへIPAがアップロードされます。

---

# 8. TestFlight

App Store Connectで

「わたしの図鑑」
→「TestFlight」

を開きます。

Apple側の処理が終わるとビルドが表示されます。

最初は「内部テスト」がおすすめです。

菅野さん、白間さんなどを
App Store Connectユーザーとして追加してテストします。

外部テスターへ広げる前に、内部テストで確認します。

---

# 9. App Store提出前

すでにリポジトリ内に以下を準備しています。

- app-store-metadata.ja-JP.json
- PRIVACY_POLICY.md
- SUPPORT.md
- privacy.html
- support.html
- App Store用1290×2796スクリーンショット生成
- PrivacyInfo.xcprivacy
- カメラ / 写真ライブラリ権限文言
- 端末内保存
- ネイティブカメラ
- Share Sheet
- Haptics
- Keyboard対応
- スプラッシュ
- ステータスバー

最後に必要なのは、Apple Developer / App Store Connect / Codemagicの
アカウント側設定です。

---

# 安全上の注意

次の秘密情報をChatGPTやGitHubへ貼らないでください。

- .p8秘密鍵の中身
- Apple IDのパスワード
- 2段階認証コード
- 配布証明書の秘密鍵
- Codemagicの秘密変数

秘密情報はApple / Codemagicの設定画面へ直接入力してください。
