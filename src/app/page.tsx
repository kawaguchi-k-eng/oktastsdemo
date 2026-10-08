import { getSession } from "@/lib/session";
import Chat from "./Chat";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const user = session?.user;

  return (
    <>
      <h1>Okta AI Agent Resource Connections デモ</h1>
      <p className="subtitle">Office 365 (Outlook) カレンダーの予定をAIエージェントとチャットで確認できます</p>

      <div className="card">
        {session ? (
          <>
            <div className="user-bar">
              {user?.name || user?.email || "ログイン中"} としてログイン中 | <a href="/logout">ログアウト</a>
            </div>
            <Chat />
          </>
        ) : (
          <>
            <p>このアプリを使うにはOktaでログインしてください。</p>
            <a className="btn" href="/login">
              Oktaでログイン
            </a>
          </>
        )}
      </div>
    </>
  );
}
