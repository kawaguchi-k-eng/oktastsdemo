# Okta AI Agent Resource Connections デモ (AWS Amplify 版)
## Office 365 (Outlook) カレンダー予定取得エージェント (チャットUI / OpenAI連携)

`okta-ai-agent-gcal-demo` (Python / Flask) を、**AWS Amplify Hosting にそのままデプロイできる
Next.js (TypeScript) アプリ**に移植したものです。機能・画面・処理の流れは元のデモと同じです。

Okta / Microsoft Entra ID / Resource Connection 側の設定手順は元デモの README
(`../okta-ai-agent-gcal-demo/README.md` の手順 1〜5)をそのまま参照してください。
このREADMEでは、Amplify 版で変わった点とデプロイ手順だけを説明します。

---

## Python版からの変更点

| 項目 | Python版 (Flask) | Amplify版 (Next.js) | 理由 |
|---|---|---|---|
| 実行基盤 | `python app.py` (常駐サーバー) | Amplify Hosting の SSR (Lambda) | Amplify Hosting はPythonのWebサーバーを動かせないため |
| ログイン | Authlib | 自前実装 (`src/lib/oidc.ts`, PKCE + state + nonce, ID Token の署名検証あり) | 依存を減らすため |
| セッション | Flask session (署名Cookie) | JWE で**暗号化**したCookie (`src/lib/session.ts`) | Lambda はリクエストごとに別インスタンスになりうるため、サーバーに状態を持たない |
| チャット履歴 | Flask session に保存 | ブラウザ側で保持し、`/chat` に毎回送信 | Cookie の4KB上限に収まらないため |
| 秘密鍵 | `keys/agent_private_key.pem` ファイル | 環境変数 `OKTA_AGENT_PRIVATE_KEY` または `_B64` (ローカルはファイルパスも可) | Amplify にはファイルを置けないため |
| 「今日」の基準 | PCのローカル時刻 | `APP_TIMEZONE` (既定 `Asia/Tokyo`) | Lambda は UTC で動くため |
| Graph の期間指定 | タイムゾーンなしの日時 | `APP_TIMEZONE` のオフセット付き (`...T00:00:00+09:00`) | 実行環境のTZに依存しないようにするため |
| `FLASK_SECRET_KEY` | | `SESSION_SECRET` に名称変更 | |
| `APP_BASE_URL` | (不要) | 追加 | CloudFront 経由でもリダイレクトURIを正しく組み立てるため |

移植していないもの:
- `/fetch-schedule`, `connect_office365.html`, `result.html` (旧ボタン版フロー。元から未使用)
- `diag_agent_auth.py`, `diag_agent_auth2.py` (ローカル用の診断スクリプト。必要なら元フォルダのものを使用)

## ファイル対応表

| Python版 | Amplify版 |
|---|---|
| `app.py` の `/` + `templates/index.html` | `src/app/page.tsx` + `src/app/Chat.tsx` |
| `app.py` の `/login`, `/authorization-code/callback`, `/logout` | `src/app/login/route.ts` ほか同名パスの `route.ts` + `src/lib/oidc.ts` |
| `app.py` の `/authorization-status` | `src/app/authorization-status/route.ts` |
| `app.py` の `/chat` | `src/app/chat/route.ts` |
| `okta_client.py` | `src/lib/okta-agent.ts` |
| `ms_calendar_client.py` | `src/lib/ms-calendar.ts` |
| `openai_summarizer.py` | `src/lib/openai.ts` |
| `schedule_range.py` | `src/lib/schedule-range.ts` (+ 日付計算は `src/lib/dates.ts`) |
| `templates/base.html` のCSS | `src/app/globals.css` |
| `.env.example` | `.env.example` (変数を追加・改名) |
| — | `amplify.yml` (Amplify のビルド設定) |

URL のパスは元と同じなので、ローカルで `http://localhost:5000` で動かす場合は
Okta 側のリダイレクトURI設定を変える必要はありません。

---

## ローカルでの実行

前提: Node.js 20 以上

```powershell
cd okta-ai-agent-gcal-demo2
npm install
copy .env.example .env.local
# .env.local を編集 (下の「環境変数」参照)。秘密鍵は OKTA_AGENT_PRIVATE_KEY_PATH でファイル指定してよい
npm run dev
```

ブラウザで `http://localhost:5000` を開きます。

---

## AWS Amplify へのデプロイ

### 1. リポジトリを用意する

このフォルダを GitHub / CodeCommit / GitLab / Bitbucket のリポジトリにpushします。
`.gitignore` で `.env*` と `keys/` は除外されているので、**秘密情報はコミットされません**。

### 2. Amplify でアプリを作成

1. AWS コンソール → **AWS Amplify** → 「新しいアプリを作成」→ リポジトリとブランチを選択
2. フレームワークが **Next.js - SSR** と検出されること、ビルド設定にリポジトリの `amplify.yml` が使われることを確認
3. 「詳細設定」またはアプリ作成後の **ホスティング > 環境変数** に、下表の変数を登録
4. デプロイ。完了後に表示されるURL (例 `https://main.d1234abcd.amplifyapp.com`) を控える
5. `APP_BASE_URL` にそのURLを設定し、再デプロイ

> Amplify Hosting の環境変数は**ビルド時にしか参照できません**。そのため `amplify.yml` で
> 必要な変数を `.env.production` に書き出し、実行時 (SSR / API ルート) から読めるようにしています。
> `NEXT_PUBLIC_` で始まらない変数はブラウザに渡らないので、クライアントには露出しません。
> 環境変数を変更したら**再デプロイが必要**です。

### 3. Okta 側のリダイレクトURIを追加

ログイン用 OIDC アプリ (AI Agent の User access に紐づくアプリ) に以下を追加します。

- Sign-in redirect URI: `https://main.d1234abcd.amplifyapp.com/authorization-code/callback`
- Sign-out redirect URI: `https://main.d1234abcd.amplifyapp.com/`

### 環境変数

| 変数 | 内容 |
|---|---|
| `OKTA_DOMAIN` | Oktaテナントのドメイン (例 `your-tenant.okta.com`) |
| `OKTA_AGENT_CLIENT_ID` | AI Agent の Client ID |
| `OKTA_AGENT_PRIVATE_KEY_B64` | 秘密鍵PEMファイル全体をBase64化した文字列 (**推奨**)<br>`[Convert]::ToBase64String([IO.File]::ReadAllBytes("keys\agent_private_key.pem"))` |
| `OKTA_AGENT_PRIVATE_KEY` | (代替) PEM の改行を `\n` に置き換えた1行の文字列 |
| `OKTA_AGENT_KEY_ID` | 鍵の kid |
| `OKTA_OFFICE365_RESOURCE_INDICATOR` | Resource Connection の Resource Indicator |
| `SESSION_SECRET` | Cookie暗号化用のランダム文字列<br>`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OKTA_WEB_LOGIN_CLIENT_ID` | ログイン用OIDCアプリの Client ID (AI Agentと同一アプリなら同じ値) |
| `OKTA_WEB_LOGIN_CLIENT_SECRET` | ログイン用アプリが `Client secret` 認証の場合のみ。空なら private_key_jwt |
| `OKTA_ISSUER` | Issuer URL (例 `https://your-tenant.okta.com`) |
| `APP_BASE_URL` | アプリの公開URL (末尾スラッシュなし) |
| `APP_TIMEZONE` | 「今日」「今週」の基準タイムゾーン (IANA形式, 既定 `Asia/Tokyo`) |
| `MS_GRAPH_TIMEZONE` | Graph の応答タイムゾーン (Windows形式, 既定 `Tokyo Standard Time`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAIのAPIキーとモデル (既定 `gpt-4o-mini`) |

> **本番運用する場合**: デモでは手軽さを優先して秘密鍵や API キーを Amplify の環境変数に
> 置いていますが、本番では AWS Secrets Manager / SSM Parameter Store (Amplify Secrets) に
> 置き、ビルド時または実行時に取得する構成を検討してください。

---

## 動作の流れ (元デモと同じ)

1. 「Oktaでログイン」→ Okta でログイン (Authorization Code + PKCE, private_key_jwt)
2. チャット欄で「今週の予定を教えて」などと送信
3. **初回のみ** `interaction_required` が返り、「Microsoftで認可する」リンクを表示
   → 別タブで認可 → 画面が `/authorization-status` をポーリングし、完了を検知すると質問を自動再送
4. 2回目以降は認可なしで、token-exchange → OpenAIで期間判定 → Graph `calendarView` → OpenAIで回答

## 注意点

- ID Token の有効期限 (Okta既定1時間) が切れると token-exchange が失敗します。
  その場合は一度ログアウトして再ログインしてください (元デモと同じ挙動)。
- チャット履歴はブラウザ側で保持して毎回サーバーに送るため、ページを再読み込みすると会話はリセットされます。
- `/chat` は OpenAI を2回呼ぶため数秒〜十数秒かかります。Amplify Hosting の SSR のタイムアウト
  (最大30秒程度) を超える場合はモデルを軽いものにしてください。

## ディレクトリ構成

```
okta-ai-agent-gcal-demo2/
├── amplify.yml                     # Amplify Hosting のビルド設定
├── package.json / tsconfig.json / next.config.ts
├── .env.example
└── src/
    ├── app/
    │   ├── layout.tsx / globals.css
    │   ├── page.tsx                # ログイン画面 / チャット画面の切り替え
    │   ├── Chat.tsx                # チャットUI (認可待ちポーリング・自動再送)
    │   ├── login/route.ts
    │   ├── authorization-code/callback/route.ts
    │   ├── logout/route.ts
    │   ├── authorization-status/route.ts
    │   └── chat/route.ts
    └── lib/
        ├── config.ts               # 環境変数 / 秘密鍵の読み込み
        ├── session.ts              # 暗号化Cookieセッション
        ├── base-url.ts             # 公開URLの組み立て
        ├── oidc.ts                 # Okta ログイン (PKCE / private_key_jwt)
        ├── okta-agent.ts           # AI Agent token-exchange (Resource Connection)
        ├── ms-calendar.ts          # Microsoft Graph calendarView
        ├── openai.ts               # 期間判定 / 応答生成
        ├── schedule-range.ts       # 期間の検証 + ルールベースのフォールバック
        └── dates.ts                # タイムゾーン対応の日付計算
```
