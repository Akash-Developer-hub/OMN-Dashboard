import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MessageSquare, Send, RefreshCw, Shield, Clock, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { ContributionDetail } from "./ContributionDetail";
import type { ApiContribution } from "./ContributionTable";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SupportThread {
  contribution_id: string;
  contribution_name: string;
  last_message: string;
  last_message_time: string;
  unread_count?: number;
  status?: string;
}

interface SupportMessage {
  id: string;
  contribution_id: string;
  sender_type: "user" | "admin";
  sender_name: string;
  message: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Thread List Item ─────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  active,
  onClick,
}: {
  thread: SupportThread;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-border transition-colors hover:bg-muted/50 ${
        active ? "bg-primary/10 border-l-2 border-l-primary" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">
              {thread.contribution_name || thread.contribution_id}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {timeAgo(thread.last_message_time)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {thread.last_message || "No messages yet"}
          </p>
          {thread.unread_count && thread.unread_count > 0 ? (
            <span className="inline-flex items-center justify-center mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
              {thread.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: SupportMessage }) {
  const isAdmin = msg.sender_type === "admin";
  return (
    <div className={`flex gap-2.5 ${isAdmin ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
          isAdmin
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {isAdmin ? <Shield className="w-4 h-4" /> : initials(msg.sender_name)}
      </div>
      <div className={`max-w-[70%] ${isAdmin ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{msg.sender_name}</span>
          <span className="text-[10px] text-muted-foreground">{fullTime(msg.created_at)}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isAdmin
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          }`}
        >
          {msg.message}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContributionSupport() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedThread, setSelectedThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [detailContribution, setDetailContribution] = useState<ApiContribution | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const openContributionDetail = async (contributionId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get("/admin-dashboard/contributors/list");
      const list: ApiContribution[] = res.data?.data || [];
      const found = list.find((c) => c.id === contributionId);
      if (found) {
        setDetailContribution(found);
        setDetailOpen(true);
      } else {
        toast.error("Contribution not found");
      }
    } catch {
      toast.error("Failed to load contribution detail");
    } finally {
      setDetailLoading(false);
    }
  };

  // Fetch thread list
  const fetchThreads = useCallback(() => {
    setThreadsLoading(true);
    api
      .get("/admin-dashboard/contributors/support")
      .then((res) => {
        const data: SupportThread[] = res.data?.data || res.data || [];
        setThreads(data);
      })
      .catch(() => {
        toast.error("Failed to load support threads");
        setThreads([]);
      })
      .finally(() => setThreadsLoading(false));
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Fetch messages for selected thread
  const fetchMessages = useCallback((threadId: string) => {
    setMessagesLoading(true);
    api
      .get(`/admin-dashboard/contributors/support/${threadId}/messages`)
      .then((res) => {
        const data: SupportMessage[] = res.data?.data || res.data || [];
        setMessages(data);
      })
      .catch(() => {
        toast.error("Failed to load messages");
        setMessages([]);
      })
      .finally(() => setMessagesLoading(false));
  }, []);

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.contribution_id);
    }
  }, [selectedThread, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send admin message
  const sendMessage = async () => {
    if (!input.trim() || !selectedThread || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Optimistic update
    const optimistic: SupportMessage = {
      id: `tmp-${Date.now()}`,
      contribution_id: selectedThread.contribution_id,
      sender_type: "admin",
      sender_name: "Admin",
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.post(
        `/admin-dashboard/contributors/support/${selectedThread.contribution_id}/messages`,
        { message: text, sender_type: "admin" }
      );
      const saved: SupportMessage = res.data?.data || optimistic;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? saved : m))
      );
      // Update thread last message
      setThreads((prev) =>
        prev.map((t) =>
          t.contribution_id === selectedThread.contribution_id
            ? { ...t, last_message: text, last_message_time: new Date().toISOString() }
            : t
        )
      );
    } catch {
      toast.error("Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filtered = threads.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.contribution_name || "").toLowerCase().includes(q) ||
      t.contribution_id.toLowerCase().includes(q) ||
      (t.last_message || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] animate-slide-in overflow-hidden">
      {/* ── LEFT: Thread List ──────────────────────────────────────── */}
      <div
        className={`flex flex-col border-r border-border shrink-0 ${
          selectedThread ? "w-[340px] hidden lg:flex" : "flex-1"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h1 className="text-base font-bold text-foreground">Contribution Support</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={fetchThreads}
              disabled={threadsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${threadsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search contributions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm">No threads found</p>
            </div>
          ) : (
            filtered.map((t) => (
              <ThreadItem
                key={t.contribution_id}
                thread={t}
                active={selectedThread?.contribution_id === t.contribution_id}
                onClick={() => {
                  setSelectedThread(t);
                  setThreads((prev) =>
                    prev.map((th) =>
                      th.contribution_id === t.contribution_id
                        ? { ...th, unread_count: 0 }
                        : th
                    )
                  );
                  // Persist read state to DB
                  api
                    .post(`/admin-dashboard/contributors/support/${t.contribution_id}/read`)
                    .catch(() => { /* non-critical */ });
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Chat Panel ──────────────────────────────────────── */}
      {selectedThread ? (
        <div className="flex flex-col flex-1 min-w-0">
          {/* Chat header */}
          <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/50">
            <div className="flex items-center gap-3 min-w-0">
              {/* Back button on mobile */}
              <button
                className="lg:hidden text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedThread(null)}
              >
                ←
              </button>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {selectedThread.contribution_name || selectedThread.contribution_id}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  ID: {selectedThread.contribution_id}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                {timeAgo(selectedThread.last_message_time)}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => openContributionDetail(selectedThread.contribution_id)}
                disabled={detailLoading}
              >
                {detailLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3" />
                )}
                View Detail
              </Button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messagesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`flex gap-2.5 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 max-w-[60%]">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-10 w-full rounded-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <MessageSquare className="w-8 h-8 opacity-30" />
                <p className="text-sm">No messages yet. Start the conversation.</p>
              </div>
            ) : (
              messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-border bg-card/30 shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1 bg-card border border-border rounded-xl px-3 py-2">
                <textarea
                  rows={1}
                  placeholder="Write a comment…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[36px] max-h-[120px] leading-relaxed"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
              </div>
              <Button
                size="icon"
                className="w-10 h-10 shrink-0"
                onClick={sendMessage}
                disabled={!input.trim() || sending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Press <kbd className="px-1 bg-muted rounded text-[9px]">Enter</kbd> to send ·{" "}
              <kbd className="px-1 bg-muted rounded text-[9px]">Shift+Enter</kbd> for new line
            </p>
          </div>
        </div>
      ) : (
        // Empty state when no thread selected (desktop)
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 opacity-40" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">Select a conversation</p>
            <p className="text-sm mt-1">Choose a contribution thread from the list to view and respond to messages.</p>
          </div>
        </div>
      )}

      <ContributionDetail
        contribution={detailContribution}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
