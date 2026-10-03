import { useEffect, useRef, useState } from "react";
import type { Realtime } from "../App";

type ChatMessage = {
  id: string;
  name: string;
  text: string;
  userId: string;
  at: number;
};

export function ArenaChat({ realtime }: { realtime: Realtime }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<string>("");

  /* incoming messages from OTHER users */
  useEffect(() => {
    const msg = realtime.lastMsg;
    if (!msg || msg.type !== "chat") return;

    /* skip our own — we already added them locally */
    if (msg.userId === realtime.userId) return;

    const key = `${msg.userId}-${msg.text}-${msg.name}`;
    if (lastSeenRef.current === key) return;
    lastSeenRef.current = key;

    setMessages((prev) => [
      ...prev,
      {
        id: `${msg.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: msg.name,
        text: msg.text,
        userId: msg.userId,
        at: Date.now(),
      },
    ]);
  }, [realtime.lastMsg, realtime.userId]);

  /* autoscroll */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const me = realtime.present.find((p) => p.userId === realtime.userId);
    const name = me?.name || "Guest";

    /* add to our own view right away */
    setMessages((prev) => [
      ...prev,
      {
        id: `${realtime.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        text: trimmed,
        userId: realtime.userId,
        at: Date.now(),
      },
    ]);

    /* broadcast to everyone else */
    realtime.send({
      type: "chat",
      text: trimmed,
      userId: realtime.userId,
      name,
    });

    setText("");
  };

  if (!open) {
    return (
      <button className="arena-chat-toggle" onClick={() => setOpen(true)}>
        Chat {messages.length > 0 && <span>{messages.length}</span>}
      </button>
    );
  }

  return (
    <aside className="arena-chat">
      <header className="arena-chat__head">
        <span className="kicker">Live chat</span>
        <button className="arena-chat__close" onClick={() => setOpen(false)} aria-label="Close chat">
          ✕
        </button>
      </header>

      <div className="arena-chat__list" ref={listRef}>
        {messages.length === 0 && (
          <p className="arena-chat__empty">No messages yet. Say something.</p>
        )}
        {messages.map((m) => {
          const mine = m.userId === realtime.userId;
          return (
            <div key={m.id} className={`arena-chat__msg ${mine ? "arena-chat__msg--me" : ""}`}>
              <span className="arena-chat__who">{mine ? "You" : m.name}</span>
              <span className="arena-chat__text">{m.text}</span>
            </div>
          );
        })}
      </div>

      <div className="arena-chat__compose">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Say something…"
          maxLength={200}
        />
        <button onClick={send} disabled={!text.trim()}>Send</button>
      </div>
    </aside>
  );
}