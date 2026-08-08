# レシピ箱

夫婦2人で共有するレシピURL管理PWA。カテゴリ別に保存でき、元サイトが消えてもページのアーカイブが残る。「今日は何作る?」でカテゴリを指定してランダムに1品提案してくれる。

- フロントエンド: バニラHTML/CSS/JS(ビルド不要)
- バックエンド: [Supabase](https://supabase.com)(DB + 認証 + Edge Function)
- 公開先: GitHub Pages
- 認証: 夫婦共有の1アカウント(メール+パスワード)

## セットアップ手順

### 1. Supabaseプロジェクトを作成

1. https://supabase.com でアカウント作成 → 新規プロジェクト作成(リージョンは **Tokyo** 推奨)
2. **Settings → API** で以下2つを控える
   - Project URL
   - anon public key
3. **Authentication → Providers** で「Email」が有効になっていることを確認(通常デフォルト有効)
4. **Authentication → Users → Add user** で、夫婦共有ログイン用のメールアドレス+パスワードを1つだけ作成
   - 「Auto Confirm User」を有効にしてメール確認をスキップする

### 2. データベースを作成

**SQL Editor** を開き、[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → [`supabase/migrations/0002_multi_tag_categories.sql`](supabase/migrations/0002_multi_tag_categories.sql) の順に貼り付けて実行する(0002はカテゴリを複数タグ選択方式にする変更。既に0001だけ実行済みの場合も0002を追加で実行すればよい)。

### 3. Edge Functionをデプロイ

**Edge Functions → Deploy a new function → Via Editor** で関数名 `fetch-recipe` を指定し、[`supabase/functions/fetch-recipe/index.ts`](supabase/functions/fetch-recipe/index.ts) の内容を貼り付けてデプロイする。CLIやNode.jsのインストールは不要。

既にデプロイ済みの場合も、0002適用後は必ず最新の`index.ts`で再デプロイすること(カテゴリの受け渡し方法が`categoryId`単体から`categoryIds`配列に変わっているため)。

### 4. アプリ側にSupabaseの接続情報を設定

[`js/config.js`](js/config.js) を開き、以下3行を書き換える。

```js
export const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';   // 手順1で控えたProject URL
export const SUPABASE_ANON_KEY = 'xxxxxxxxxxxx';                   // 手順1で控えたanon public key
export const LOGIN_EMAIL = 'your-family-login@example.com';        // 手順1で作成したログイン用メールアドレス
```

`fetch-recipe` のCORS許可オリジンも、実際に公開するGitHub PagesのURLに合わせて [`supabase/functions/fetch-recipe/index.ts`](supabase/functions/fetch-recipe/index.ts) 冒頭の `PRODUCTION_ORIGINS` を必要に応じて書き換え、Edge Functionを再デプロイする(既定値は `https://yudaidai-study.github.io`)。

### 5. GitHubで公開する

1. GitHub上で新規リポジトリ `04_RecipeBox` を **Public** で作成
2. このフォルダの内容をpush
3. リポジトリの **Settings → Pages** で Source を `main` ブランチ / root に設定

公開後、`https://<GitHubユーザー名>.github.io/04_RecipeBox/` でアクセスできる。

### 6. iPhone側のセットアップ

1. Safariで公開URLを開き、共有ボタン →「ホーム画面に追加」
2. ホーム画面のアイコンから起動し、共有パスワードでログイン
3. 共有シートからの保存用に、「ショートカット」アプリで以下を作成(1回だけ)
   - 新規ショートカット作成 →「共有シートに表示」を有効化、受け付ける種類に「URL」「Webページ」を指定
   - アクション「URLを開く」を追加し、開くURLを `https://<GitHubユーザー名>.github.io/04_RecipeBox/add.html?url=[共有された入力]` に設定(`[共有された入力]` はShortcuts上の変数)
4. これで、SafariなどでレシピURLを開いた状態から共有ボタン→作成したショートカットを選ぶと、URLが入力済みの保存画面が開く

初回はホーム画面アプリとShortcuts経由のSafariでログインセッションが別々になるため、それぞれで1回ずつログインが必要(パスワード入力のみのシンプルな画面)。

## ローカルでの動作確認

```bash
python -m http.server 8000
```

を実行し、`http://localhost:8000/` を開く。Supabase設定(`js/config.js`)が済んでいれば、ローカルのままログイン・保存・一覧表示まで確認できる。

## アプリ本体を更新したとき

このアプリはPWAとして `sw.js` がアプリの外枠(HTML/CSS/JS)をキャッシュしています。そのため、`index.html`や`js/*.js`などを更新してpushしても、**一度開いたことがある端末では古いキャッシュが優先され、変更がすぐには反映されません**。更新をpushするたびに、[`sw.js`](sw.js) 先頭の

```js
const CACHE = 'recipebox-v2';
```

の数字を1つ上げてからpushしてください。古いキャッシュが破棄され、次回アクセス時に新しい内容が読み込まれます。

## 既知の制約

- Supabase無料プランは7日間APIアクセスがないとプロジェクトが一時停止する(データは消えない。ダッシュボードで再開できる)
- サムネイル画像(`image_url`)は元サイトへの参照であり複製ではない。元サイト消滅後は表示できなくなる場合がある(タイトル・本文は実体コピーのため消えない)
- 一部サイトはボット対策によりアーカイブ取得に失敗することがある。その場合もURL自体は保存される
- iOS SafariはWeb Share Target APIに対応していないため、共有シートからの保存はShortcuts経由が正式な手段
