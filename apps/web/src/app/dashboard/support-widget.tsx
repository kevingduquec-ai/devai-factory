"use client";

import { useEffect, useRef, useState } from "react";
import type { SupportMessageDto, SupportThreadDto } from "@devai-factory/shared-types";
import { Spinner } from "@/components/spinner";
import { extractErrorMessage } from "@/lib/error-message";

const POLL_CLOSED_MS = 20000;
const POLL_OPEN_MS = 4000;

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.05-3.5A7.93 7.93 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<SupportMessageDto[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  async function fetchUnread() {
    try {
      const res = await fetch("/api/support/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setUnread(typeof data.count === "number" ? data.count : 0);
    } catch {
      // silencioso — un fallo de red aquí no debe interrumpir al usuario
    }
  }

  async function fetchMessages() {
    try {
      const res = await fetch("/api/support/messages");
      if (!res.ok) return;
      const data: SupportThreadDto = await res.json();
      setMessages(data.messages);
      setClosed(data.closed);
      setUnread(0);
    } catch {
      // silencioso — se reintenta en el próximo poll
    }
  }

  useEffect(() => {
    fetchUnread();
    const id = setInterval(() => {
      if (!openRef.current) fetchUnread();
    }, POLL_CLOSED_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchMessages();
    const id = setInterval(fetchMessages, POLL_OPEN_MS);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo enviar el mensaje"));
      }
      setDraft("");
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[440px] w-[330px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between bg-qubit-navy px-4 py-3">
            <div>
              <p className="font-heading text-sm font-bold text-white">Soporte Qubit</p>
              <p className="text-[11px] text-white/60">Te responde el equipo de Qubit</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white"
              aria-label="Cerrar chat"
            >
              ✕
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages === null ? (
              <div className="flex h-full items-center justify-center">
                <Spinner className="h-5 w-5 text-muted" />
              </div>
            ) : messages.length === 0 ? (
              <p className="mt-6 text-center text-xs text-muted">
                Escríbenos si tienes una pregunta o necesitas ayuda — te responde el equipo de Qubit.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderIsAdmin ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.senderIsAdmin
                        ? "bg-qubit-gray-100 text-foreground dark:bg-white/10"
                        : "bg-qubit-blue-400 text-white"
                    }`}
                  >
                    {m.senderIsAdmin ? (
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Equipo Qubit
                      </p>
                    ) : (
                      m.senderUser?.name && (
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                          {m.senderUser.name}
                        </p>
                      )
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {closed && (
            <p className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              El equipo de Qubit cerró esta conversación. Si escribes de nuevo, se vuelve a abrir.
            </p>
          )}
          <form onSubmit={onSend} className="border-t border-border p-2.5">
            {error && <p className="mb-1.5 px-1 text-xs text-red-600">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend(e);
                  }
                }}
                rows={1}
                placeholder="Escribe un mensaje..."
                className="max-h-24 flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-qubit-blue-400"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="font-accent shrink-0 rounded-md bg-qubit-blue-400 px-3 py-2 text-sm font-semibold text-white transition hover:bg-qubit-blue-600 disabled:opacity-50"
              >
                {sending ? <Spinner className="h-4 w-4" /> : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-qubit-blue-400 text-white shadow-lg shadow-qubit-blue-400/30 transition hover:bg-qubit-blue-600"
        aria-label={open ? "Cerrar chat de soporte" : "Abrir chat de soporte"}
      >
        <ChatBubbleIcon />
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
