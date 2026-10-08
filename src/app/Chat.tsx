"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

type Turn = { role: "user" | "assistant"; content: string };
type Msg = { id: number; cls: "user" | "agent" | "system"; text: string; authUri?: string };

const MAX_HISTORY = 20; // 直近の履歴だけ保持

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 0, cls: "agent", text: "こんにちは。本日のOutlookカレンダーについてお尋ねください。\n例:「本日の予定をください」" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // 会話履歴。サーバーはステートレスなので、ブラウザ側で持って毎回 /chat に送る
  // (Python版では Flask の session に保存していた)
  const history = useRef<Turn[]>([]);
  const nextId = useRef(1);
  const pendingMessage = useRef<string | null>(null); // 認可待ちで保留しているユーザー発話
  const polling = useRef(false);
  const authPopup = useRef<Window | null>(null); // Microsoft認可のポップアップ
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMsg = useCallback((cls: Msg["cls"], text: string, authUri?: string) => {
    const id = nextId.current++;
    setMessages((m) => [...m, { id, cls, text, authUri }]);
    return id;
  }, []);
  const updateMsg = useCallback((id: number, text: string) => {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, text } : x)));
  }, []);
  const removeMsg = useCallback((id: number) => {
    setMessages((m) => m.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const sendMessage = useCallback(
    async (message: string) => {
      setBusy(true);
      const thinking = addMsg("system", "…");
      try {
        const res = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history: history.current }),
        });
        const data = await res.json();
        removeMsg(thinking);

        if (data.need_login) {
          addMsg("system", "セッションが切れました。ログインし直してください。");
          setTimeout(() => (window.location.href = "/login"), 1500);
          return;
        }

        if (data.needs_authorization) {
          pendingMessage.current = message;
          addMsg("agent", data.reply, data.interaction_uri);
          startPolling();
          return;
        }

        addMsg("agent", data.reply || "(応答なし)");
        if (res.ok) {
          history.current = [
            ...history.current,
            { role: "user" as const, content: message },
            { role: "assistant" as const, content: data.reply },
          ].slice(-MAX_HISTORY);
        }
      } catch (e) {
        removeMsg(thinking);
        addMsg("system", "通信エラー: " + e);
      } finally {
        setBusy(false);
      }
    },
    // startPolling は sendMessage を参照するため、ref経由で循環を避ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMsg, removeMsg],
  );

  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;

  /**
   * 認可画面をポップアップウィンドウで開く。
   * ブロックされた場合は false を返し、リンク本来の動作(別タブ)に任せる。
   */
  function openAuthPopup(uri: string): boolean {
    const w = 520;
    const h = 680;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    // 先に空のウィンドウを開いて opener を切ってから遷移する
    // (noopener 指定だと参照が取れず、完了後に閉じられないため)
    const popup = window.open("", "ms-authorize", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) return false;
    popup.opener = null;
    popup.location.href = uri;
    popup.focus();
    authPopup.current = popup;
    return true;
  }

  function onAuthorizeClick(e: MouseEvent<HTMLAnchorElement>, uri: string) {
    if (openAuthPopup(uri)) e.preventDefault();
    startPolling();
  }

  function closeAuthPopup() {
    try {
      authPopup.current?.close();
    } catch {
      // 既に閉じられている場合など
    }
    authPopup.current = null;
  }

  function startPolling() {
    if (polling.current) return;
    polling.current = true;
    const note = addMsg("system", "Microsoftでの認可を待っています…(ポップアップで許可してください)");
    const timer = setInterval(async () => {
      let data: { status?: string; detail?: string };
      try {
        const res = await fetch("/authorization-status", { cache: "no-store" });
        data = await res.json();
      } catch {
        return; // 次の周期で再試行
      }
      if (data.status === "ready") {
        clearInterval(timer);
        polling.current = false;
        closeAuthPopup();
        updateMsg(note, "認可を確認しました。回答を作成しています…");
        const msg = pendingMessage.current || "本日の予定をください";
        pendingMessage.current = null;
        sendRef.current(msg);
      } else if (data.status === "error" || data.status === "unauthenticated") {
        clearInterval(timer);
        polling.current = false;
        updateMsg(note, "エラー: " + (data.detail || data.status));
      }
    }, 3000);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    addMsg("user", message);
    setInput("");
    sendMessage(message);
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.cls}`}>
            {m.text}
            {m.authUri && (
              <>
                <br />
                <a
                  className="btn"
                  href={m.authUri}
                  target="_blank"
                  rel="noopener"
                  onClick={(e) => onAuthorizeClick(e, m.authUri!)}
                >
                  Microsoftで認可する
                </a>
              </>
            )}
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力(例:本日の予定をください)"
        />
        <button type="submit" disabled={busy}>
          送信
        </button>
      </form>
    </div>
  );
}
