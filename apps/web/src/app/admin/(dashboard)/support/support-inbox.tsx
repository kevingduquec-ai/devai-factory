"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminSupportConversationDto, AdminSupportThreadDto } from "@devai-factory/shared-types";
import { PLAN_LABEL_ES } from "@devai-factory/shared-types";
import { Spinner } from "@/components/spinner";
import { extractErrorMessage } from "@/lib/error-message";

const POLL_LIST_MS = 8000;
const POLL_THREAD_MS = 4000;

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function SupportInbox({ initialConversations }: { initialConversations: AdminSupportConversationDto[] }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialConversations[0]?.orgId ?? null);
  const [thread, setThread] = useState<AdminSupportThreadDto | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingClosed, setTogglingClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/admin/support/conversations");
      if (!res.ok) return;
      const data: AdminSupportConversationDto[] = await res.json();
      setConversations(data);
    } catch {
      // silencioso — se reintenta en el próximo poll
    }
  }

  async function fetchThread(orgId: string) {
    try {
      const res = await fetch(`/api/admin/support/conversations/${orgId}`);
      if (!res.ok) return;
      const data: AdminSupportThreadDto = await res.json();
      setThread(data);
    } catch {
      // silencioso — se reintenta en el próximo poll
    }
  }

  useEffect(() => {
    const id = setInterval(fetchConversations, POLL_LIST_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedOrgId) {
      setThread(null);
      return;
    }
    setThread(null);
    fetchThread(selectedOrgId);
    const id = setInterval(() => fetchThread(selectedOrgId), POLL_THREAD_MS);
    return () => clearInterval(id);
  }, [selectedOrgId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [thread]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrgId) return;
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/conversations/${selectedOrgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo enviar el mensaje"));
      }
      setDraft("");
      await fetchThread(selectedOrgId);
      await fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  /** Cerrar o reabrir es una acción exclusiva del super-admin — no existe el botón equivalente del lado de la organización. */
  async function onToggleClosed() {
    if (!selectedOrgId || !thread) return;
    setError(null);
    setTogglingClosed(true);
    try {
      const res = await fetch(`/api/admin/support/conversations/${selectedOrgId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closed: !thread.closed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "No se pudo actualizar la conversación"));
      }
      await fetchThread(selectedOrgId);
      await fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTogglingClosed(false);
    }
  }

  const selected = conversations.find((c) => c.orgId === selectedOrgId);

  return (
    <div
      className="grid gap-4 overflow-hidden rounded-xl border border-border bg-surface md:grid-cols-[280px_1fr]"
      style={{ height: "600px" }}
    >
      <div className="min-h-0 overflow-y-auto border-r border-border">
        {conversations.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted">Todavía no hay conversaciones de soporte.</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.orgId}
              type="button"
              onClick={() => setSelectedOrgId(c.orgId)}
              className={`block w-full border-b border-border px-4 py-3 text-left transition ${
                c.orgId === selectedOrgId ? "bg-qubit-blue-400/10" : "hover:bg-qubit-gray-100 dark:hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-accent truncate text-sm font-medium">{c.orgName}</p>
                {c.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-[11px] text-muted">{PLAN_LABEL_ES[c.plan]}</p>
                {c.closed && (
                  <span className="rounded-full bg-qubit-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-muted dark:bg-white/10">
                    Cerrada
                  </span>
                )}
              </div>
              {c.lastMessage && (
                <p className="mt-1 truncate text-xs text-muted">
                  {c.lastMessage.senderIsAdmin ? "Tú: " : ""}
                  {c.lastMessage.body}
                </p>
              )}
              {c.lastMessage && (
                <p className="mt-0.5 text-[10px] text-muted">{formatTime(c.lastMessage.createdAt)}</p>
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="font-accent text-sm font-semibold">{selected.orgName}</p>
                <p className="text-xs text-muted">Plan {PLAN_LABEL_ES[selected.plan]}</p>
              </div>
              {thread && (
                <button
                  type="button"
                  onClick={onToggleClosed}
                  disabled={togglingClosed}
                  className={`font-accent shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    thread.closed
                      ? "border-qubit-blue-400 text-qubit-blue-600 hover:bg-qubit-blue-400/10 dark:text-qubit-blue-400"
                      : "border-border text-muted hover:bg-qubit-gray-100 dark:hover:bg-white/5"
                  }`}
                >
                  {togglingClosed ? <Spinner className="h-3.5 w-3.5" /> : thread.closed ? "Reabrir" : "Cerrar conversación"}
                </button>
              )}
            </div>
            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {thread === null ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-5 w-5 text-muted" />
                </div>
              ) : (
                thread.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.senderIsAdmin ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                        m.senderIsAdmin
                          ? "bg-qubit-blue-400 text-qubit-navy"
                          : "bg-qubit-gray-100 text-foreground dark:bg-white/10"
                      }`}
                    >
                      {!m.senderIsAdmin && (
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {m.senderUser?.name ?? "Usuario"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {thread?.closed && (
              <p className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Cerraste esta conversación. Si respondes, se vuelve a abrir.
              </p>
            )}
            <form onSubmit={onSend} className="border-t border-border p-3">
              {error && <p className="mb-1.5 text-xs text-red-600">{error}</p>}
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
                  rows={2}
                  placeholder="Responder..."
                  className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-qubit-blue-400"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="font-accent shrink-0 rounded-md bg-qubit-blue-400 px-4 py-2 text-sm font-semibold text-qubit-navy transition hover:bg-qubit-blue-600 hover:text-white disabled:opacity-50"
                >
                  {sending ? <Spinner className="h-4 w-4" /> : "Enviar"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
