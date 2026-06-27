"use client";

import { useState, useEffect, useRef } from "react";
import {
  startUpload,
  getUploadStatus,
  getStatistics,
  resetDatabase,
  getStatus,
  sendChat,
  getQuiz,
  runRagasEvaluation,
  getRagasSummary,
  getConfig,
  getBooks,
  activateBook,
  deleteBook,
  TOKENS,
  type BookInfo,
  type ChatSource,
  type ValidationResult,
} from "@/lib/api";

type Tab = "dashboard" | "upload" | "chat" | "quiz" | "evaluate" | "config";
type UploadState = "idle" | "uploading" | "success" | "error";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  validation?: ValidationResult;
  isLoading?: boolean;
};

type QuizQuestion = {
  soal: string;
  opsi: string[];
  kunci: string;
  penjelasan: string;
};

export default function TeacherDashboard({ token: _token, onLogout }: { token?: string; onLogout?: () => void }) {
  const token = _token?.trim() || TOKENS.guru;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [bookStatus, setBookStatus] = useState<{
    book_uploaded: boolean;
    chain_ready: boolean;
    message: string;
  } | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Book library state
  const [bookList, setBookList] = useState<BookInfo[]>([]);
  const [bookListLoading, setBookListLoading] = useState(false);
  const [bookListError, setBookListError] = useState<string | null>(null);
  const [bookActionLoading, setBookActionLoading] = useState<string | null>(null);

  // Chat state (guru can also test)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Halo, Guru! 👋 Gunakan panel ini untuk menguji sistem RAG. Pertanyaan akan diproses lengkap dengan validasi anti-halusinasi dan sumber referensi.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizCount, setQuizCount] = useState(3);
  const [selectedBab, setSelectedBab] = useState<number | null>(null);

  // RAGAS state
  const [ragasQuestions, setRagasQuestions] = useState("");
  const [ragasGroundTruths, setRagasGroundTruths] = useState("");
  const [ragasLoading, setRagasLoading] = useState(false);
  const [ragasResult, setRagasResult] = useState<import("@/lib/api").RAGASEvaluationResponse | null>(null);
  const [ragasSummary, setRagasSummary] = useState<Record<string, unknown> | null>(null);

  // Reset confirm
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Loading states for each section
  const [statusLoading, setStatusLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    refreshStatus();
    // Poll status every 5 seconds for real-time updates
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === "dashboard") {
      refreshStatus();
      loadStats();
      loadBooks(); // needed for Total Chunks card
    }
    if (tab === "upload") loadBooks();
    if (tab === "config") loadConfig();
    if (tab === "evaluate") loadRagasSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshStatus() {
    setStatusLoading((prev) => prev);
    try {
      const s = await getStatus();
      setBookStatus(s);
    } catch {} finally {
      setStatusLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const s = await getStatistics(token);
      setStats(s);
    } catch {} finally {
      setStatsLoading(false);
    }
  }

  async function loadConfig() {
    setConfigLoading(true);
    try {
      const c = await getConfig(token);
      setConfig(c);
    } catch {} finally {
      setConfigLoading(false);
    }
  }

  async function loadRagasSummary() {
    try {
      const s = await getRagasSummary(token);
      setRagasSummary(s);
    } catch {}
  }

  async function loadBooks() {
    setBookListLoading(true);
    setBookListError(null);
    try {
      const res = await getBooks(token);
      setBookList(res.books);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("404") || msg.includes("not found") || msg.includes("ngrok") || msg.includes("timeout")) {
        setBookListError("Backend belum diperbarui. Jalankan ulang Cell 8 di Colab, lalu klik Refresh.");
      } else {
        setBookListError("Gagal memuat riwayat: " + msg);
      }
    } finally {
      setBookListLoading(false);
    }
  }

  async function handleActivateBook(bookId: string) {
    setBookActionLoading(bookId);
    try {
      await activateBook(token, bookId);
      await Promise.all([loadBooks(), refreshStatus()]);
    } catch (e: unknown) {
      alert("Gagal aktifkan buku: " + (e as Error).message);
    } finally {
      setBookActionLoading(null);
    }
  }

  async function handleDeleteBook(bookId: string, filename: string) {
    if (!confirm(`Hapus buku "${filename}"? Data ChromaDB-nya akan ikut dihapus.`)) return;
    setBookActionLoading(bookId);
    try {
      await deleteBook(token, bookId);
      await loadBooks();
    } catch (e: unknown) {
      alert("Gagal hapus buku: " + (e as Error).message);
    } finally {
      setBookActionLoading(null);
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    setUploadMsg("❌ File harus berformat PDF!");
    setUploadState("error");
    return;
  }

  setUploadState("uploading");
  setUploadMsg("⏳ Mengirim file ke server...");

  try {
    const { job_id } = await startUpload(token, file);

    setUploadMsg("⚙️ File diterima! Sedang diproses (OCR + embedding)...");

    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const s = await getUploadStatus(token, job_id);
          if (s.status === "done") {
            clearInterval(interval);
            const res = s.result ?? {};
            setUploadMsg(
              `✅ Berhasil! ${res.total_chunks ?? 0} chunks dari ${res.total_elements ?? 0} elemen.`
            );
            setUploadState("success");
            refreshStatus();
            resolve();
          } else if (s.status === "error") {
            clearInterval(interval);
            reject(new Error(s.error ?? "Proses gagal di server"));
          } else {
            setUploadMsg("⚙️ Masih memproses... harap tunggu.");
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 3000);
    });

  } catch (e: unknown) {
    setUploadMsg("❌ Gagal upload: " + (e as Error).message);
    setUploadState("error");
  }
}

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────
  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const text = chatInput.trim();
    setChatInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", text };
    const loadingMsg: Message = { id: Date.now() + "l", role: "assistant", text: "", isLoading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setChatLoading(true);

    try {
      const res = await sendChat(token, text, { include_sources: true, include_validation: true });
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { ...m, text: res.answer, sources: res.sources, validation: res.validation, isLoading: false }
            : m
        )
      );
    } catch (e: unknown) {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { ...m, text: "❌ Error: " + (e as Error).message, isLoading: false }
            : m
        )
      );
    } finally {
      setChatLoading(false);
    }
  }

  // ── Quiz ─────────────────────────────────────────────────────────────────────
  async function handleGenerateQuiz() {
    setQuizLoading(true);
    setQuizQuestions([]);
    try {
      const res = await getQuiz(token, quizCount, selectedBab !== null ? String(selectedBab) : undefined);
      setQuizQuestions(res.quiz || []);
    } catch (e: unknown) {
      alert("Error: " + (e as Error).message);
    } finally {
      setQuizLoading(false);
    }
  }

  // ── RAGAS ────────────────────────────────────────────────────────────────────
  async function handleRunRagas() {
    const questions = ragasQuestions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    if (!questions.length) return;

    const gts = ragasGroundTruths
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);

    setRagasLoading(true);
    setRagasResult(null);
    try {
      const res = await runRagasEvaluation(token, questions, gts.length ? gts : undefined);
      setRagasResult(res);
      loadRagasSummary();
    } catch (e: unknown) {
      alert("RAGAS Error: " + (e as Error).message);
    } finally {
      setRagasLoading(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  async function handleReset() {
    setResetLoading(true);
    try {
      await resetDatabase(token);
      setResetConfirm(false);
      setStats(null);
      await refreshStatus();
      await loadStats();
    } catch (e: unknown) {
      alert("Reset error: " + (e as Error).message);
    } finally {
      setResetLoading(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "upload", label: "Upload Buku", icon: "📤" },
    { key: "chat", label: "Test Chat", icon: "💬" },
    { key: "quiz", label: "Generate Kuis", icon: "📝" },
    { key: "evaluate", label: "Evaluasi RAGAS", icon: "🔬" },
    { key: "config", label: "Konfigurasi", icon: "⚙️" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8faff",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 20px rgba(30,27,75,0.5)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              background: "linear-gradient(135deg, #818cf8, #c084fc)",
              borderRadius: 10,
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            🎓
          </div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 17, letterSpacing: -0.3 }}>
              Panel Guru — Asisten Belajar SD
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
              RAG System v7.1 • DeepSeek R1 • Llama Guard 3
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              background: bookStatus?.chain_ready ? "#065f46" : bookStatus?.book_uploaded ? "#92400e" : "#7f1d1d",
              border: `1px solid ${bookStatus?.chain_ready ? "#34d399" : "#fbbf24"}`,
              borderRadius: 20,
              padding: "4px 14px",
              color: bookStatus?.chain_ready ? "#6ee7b7" : "#fde68a",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {statusLoading && !bookStatus ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Spinner size={12} color="#fde68a" /> Memuat...</span>
            ) : bookStatus?.chain_ready ? "✅ Sistem Siap" : bookStatus?.book_uploaded ? "⚙️ Loading Chain" : "❌ Buku Belum Ada"}
          </div>
          <button
            onClick={() => { if (onLogout) onLogout(); else { localStorage.clear(); window.location.href = "/"; } }}
            style={{
              padding: "6px 16px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 20,
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 220,
            background: "white",
            borderRight: "1px solid #e8eaf6",
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: tab === t.key ? "linear-gradient(135deg, #4f46e5, #7c3aed)" : "transparent",
                color: tab === t.key ? "white" : "#555",
                fontWeight: tab === t.key ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.background = "#f0f0ff";
              }}
              onMouseLeave={(e) => {
                if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #e8eaf6" }}>
            {resetConfirm ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, textAlign: "center" }}>
                  Yakin reset database?
                </div>
                <button
                  onClick={handleReset}
                  disabled={resetLoading}
                  style={{
                    padding: "8px",
                    background: "#ef4444",
                    border: "none",
                    borderRadius: 8,
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                >
                  {resetLoading ? "⏳ Mereset..." : "✅ Ya, Reset!"}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  style={{
                    padding: "8px",
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: 8,
                    color: "#333",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetConfirm(true)}
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  color: "#ef4444",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                🗑️ Reset Database
              </button>
            )}
          </div>
        </nav>

        {/* Main Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>

          {/* ── DASHBOARD ─────────────────────────────────────────────── */}
          {tab === "dashboard" && (
            <div>
              <h2 style={heading2}>📊 Dashboard Sistem</h2>

              {/* Status Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                <StatCard
                  icon={bookStatus?.chain_ready ? "✅" : "❌"}
                  title="Status Buku"
                  value={bookStatus?.chain_ready ? "Siap" : bookStatus?.book_uploaded ? "Processing" : "Belum Ada"}
                  color={bookStatus?.chain_ready ? "#065f46" : "#7f1d1d"}
                  bg={bookStatus?.chain_ready ? "#ecfdf5" : "#fef2f2"}
                />
                <StatCard
                  icon="📄"
                  title="Total Chunks"
                  value={String(bookList.find(b => b.is_active)?.total_chunks ?? "—")}
                  color="#1e40af"
                  bg="#eff6ff"
                />
                <StatCard
                  icon="💬"
                  title="Total Chat"
                  value={String((stats as Record<string, unknown>)?.total_queries ?? "—")}
                  color="#5b21b6"
                  bg="#f5f3ff"
                />
                <StatCard
                  icon="🔬"
                  title="RAGAS Runs"
                  value={String(
                    ((stats as Record<string, unknown>)?.ragas_evaluation as Record<string, unknown>)?.total_ragas_evaluations ?? "—"
                  )}
                  color="#9a3412"
                  bg="#fff7ed"
                />
              </div>

              {/* Raw Stats */}
              {statsLoading && (
                <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                  <Spinner size={24} />
                  <span style={{ marginLeft: 12, color: "#6b7280", fontSize: 14 }}>Memuat statistik...</span>
                </div>
              )}
              {!statsLoading && stats && (
                <div style={card}>
                  <h3 style={heading3}>📈 Statistik Detail</h3>
                  <pre
                    style={{
                      background: "#0f172a",
                      color: "#e2e8f0",
                      borderRadius: 10,
                      padding: 16,
                      overflow: "auto",
                      fontSize: 12,
                      lineHeight: 1.6,
                      maxHeight: 400,
                    }}
                  >
                    {JSON.stringify(stats, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── UPLOAD ────────────────────────────────────────────────── */}
          {tab === "upload" && (
            <>
            <div>
              <h2 style={heading2}>📤 Upload Buku Pelajaran</h2>
              <div style={card}>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `3px dashed ${dragOver ? "#4f46e5" : "#c7d2fe"}`,
                    borderRadius: 16,
                    padding: "48px 24px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: dragOver ? "#eef2ff" : "#f8f9ff",
                    transition: "all 0.2s",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>
                    {uploadState === "uploading" ? "⏳" : uploadState === "success" ? "✅" : uploadState === "error" ? "❌" : "📁"}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#4f46e5", marginBottom: 6 }}>
                    {uploadState === "idle"
                      ? "Klik atau drag & drop file PDF"
                      : uploadState === "uploading"
                      ? "Memproses buku..."
                      : "Selesai!"}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Hanya file PDF yang diterima. Sistem akan otomatis memproses dan membuat vector database.
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />

                {uploadMsg && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: uploadState === "success" ? "#ecfdf5" : uploadState === "error" ? "#fef2f2" : "#eff6ff",
                      border: `1px solid ${uploadState === "success" ? "#a7f3d0" : uploadState === "error" ? "#fecaca" : "#bfdbfe"}`,
                      color: uploadState === "success" ? "#065f46" : uploadState === "error" ? "#7f1d1d" : "#1e40af",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {uploadMsg}
                  </div>
                )}

                {uploadState === "uploading" && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 6, background: "#e0e7ff", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                          animation: "progress-bar 2s ease-in-out infinite",
                          width: "60%",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ ...card, marginTop: 16 }}>
                <h3 style={heading3}>ℹ️ Cara Kerja Upload</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 8 }}>
                  {[
                    { step: "1", icon: "📄", text: "PDF diekstrak menggunakan Unstructured + OCR (Tesseract)" },
                    { step: "2", icon: "✂️", text: "Teks dipotong dengan Semantic Chunker berbasis embedding" },
                    { step: "3", icon: "🧮", text: "Setiap chunk dibuat embeddingnya dengan multilingual model" },
                    { step: "4", icon: "💾", text: "Disimpan ke ChromaDB untuk retrieval MMR + Cross-Encoder" },
                  ].map((s) => (
                    <div
                      key={s.step}
                      style={{
                        background: "#f8f9ff",
                        borderRadius: 12,
                        padding: 14,
                        border: "1px solid #e0e7ff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            background: "#4f46e5",
                            color: "white",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {s.step}
                        </span>
                        <span style={{ fontSize: 18 }}>{s.icon}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{s.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

              {/* ── BOOK LIBRARY ──────────────────────────────────── */}
              <div style={{ ...card, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={heading3}>📚 Riwayat Buku Diupload</h3>
                  <button
                    onClick={loadBooks}
                    disabled={bookListLoading}
                    style={{
                      padding: "6px 14px",
                      background: "#f0f4ff",
                      border: "1px solid #c7d2fe",
                      borderRadius: 8,
                      color: "#4f46e5",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: bookListLoading ? "wait" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {bookListLoading ? "⏳ Memuat..." : "🔄 Refresh"}
                  </button>
                </div>

                {bookListLoading && bookList.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Spinner size={20} /> Memuat daftar buku...
                  </div>
                )}

                {bookListError && (
                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
                    ⚠️ {bookListError}
                  </div>
                )}

                {!bookListLoading && !bookListError && bookList.length === 0 && (
                  <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 14 }}>
                    📭 Belum ada buku. Upload PDF pertama kamu di atas!
                  </div>
                )}

                {bookList.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bookList.map((book) => (
                      <div
                        key={book.book_id}
                        style={{
                          padding: "14px 16px",
                          background: book.is_active ? "#ecfdf5" : "#f9fafb",
                          border: `1px solid ${book.is_active ? "#6ee7b7" : "#e5e7eb"}`,
                          borderRadius: 12,
                        }}
                      >
                        {/* Row 1: icon + name + actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 20, flexShrink: 0 }}>{book.is_active ? "✅" : "📘"}</span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {book.filename}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              Diupload: {new Date(book.uploaded_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                              {book.is_active && <span style={{ marginLeft: 8, color: "#065f46", fontWeight: 700 }}>● Sedang Aktif</span>}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            {!book.is_active && (
                              <button
                                onClick={() => handleActivateBook(book.book_id)}
                                disabled={bookActionLoading === book.book_id}
                                style={{
                                  padding: "6px 14px",
                                  background: bookActionLoading === book.book_id ? "#e5e7eb" : "#4f46e5",
                                  border: "none",
                                  borderRadius: 8,
                                  color: "white",
                                  fontWeight: 600,
                                  fontSize: 13,
                                  cursor: bookActionLoading === book.book_id ? "wait" : "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                {bookActionLoading === book.book_id ? "⏳" : "▶ Aktifkan"}
                              </button>
                            )}
                            {book.is_active && (
                              <span style={{ padding: "6px 14px", background: "#d1fae5", borderRadius: 8, color: "#065f46", fontWeight: 700, fontSize: 13 }}>
                                ✓ Aktif
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteBook(book.book_id, book.filename)}
                              disabled={book.is_active || bookActionLoading === book.book_id}
                              title={book.is_active ? "Aktifkan buku lain dulu sebelum menghapus ini" : ""}
                              style={{
                                padding: "6px 14px",
                                background: book.is_active ? "#f3f4f6" : "#fef2f2",
                                border: `1px solid ${book.is_active ? "#d1d5db" : "#fecaca"}`,
                                borderRadius: 8,
                                color: book.is_active ? "#9ca3af" : "#ef4444",
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: book.is_active ? "not-allowed" : "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              🗑️ Hapus
                            </button>
                          </div>
                        </div>

                        {/* Row 2: stats chips */}
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          {book.total_chunks > 0 && (
                            <span style={{ fontSize: 12, padding: "3px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, color: "#1d4ed8", fontWeight: 600 }}>
                              ✂️ {book.total_chunks.toLocaleString("id-ID")} chunks
                            </span>
                          )}
                          {(book.total_elements ?? 0) > 0 && (
                            <span style={{ fontSize: 12, padding: "3px 10px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 20, color: "#7c3aed", fontWeight: 600 }}>
                              📄 {book.total_elements!.toLocaleString("id-ID")} elemen
                            </span>
                          )}
                          {(book.avg_chunk_size ?? 0) > 0 && (
                            <span style={{ fontSize: 12, padding: "3px 10px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 20, color: "#065f46", fontWeight: 600 }}>
                              📏 rata-rata {book.avg_chunk_size} karakter/chunk
                            </span>
                          )}
                          {(book.processing_time ?? 0) > 0 && (
                            <span style={{ fontSize: 12, padding: "3px 10px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, color: "#92400e", fontWeight: 600 }}>
                              ⏱️ proses {book.processing_time}s
                            </span>
                          )}
                          {book.total_chunks === 0 && (
                            <span style={{ fontSize: 12, padding: "3px 10px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 20, color: "#6b7280" }}>
                              ℹ️ Dideteksi otomatis — upload ulang untuk info lengkap
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── CHAT ──────────────────────────────────────────────────── */}
          {tab === "chat" && (
            <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 112px)" }}>
              <h2 style={{ ...heading2, marginBottom: 12 }}>💬 Test Chat RAG</h2>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  background: "white",
                  borderRadius: 16,
                  border: "1px solid #e0e7ff",
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: msg.role === "user" ? "row-reverse" : "row",
                      gap: 10,
                      marginBottom: 16,
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: msg.role === "user" ? "#4f46e5" : "#f0f4ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      {msg.role === "user" ? "👩‍🏫" : "🤖"}
                    </div>
                    <div style={{ maxWidth: "75%" }}>
                      <div
                        style={{
                          background: msg.role === "user" ? "#4f46e5" : "#f8f9ff",
                          color: msg.role === "user" ? "white" : "#1f2937",
                          borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          padding: "10px 14px",
                          fontSize: 14,
                          lineHeight: 1.6,
                          border: msg.role === "assistant" ? "1px solid #e0e7ff" : "none",
                        }}
                      >
                        {msg.isLoading ? (
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#999" }}>Memproses RAG pipeline...</span>
                            {[0, 1, 2].map((i) => (
                              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#4f46e5", animation: "bounce 0.8s infinite", animationDelay: `${i * 0.2}s` }} />
                            ))}
                          </div>
                        ) : (
                          <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
                        )}
                      </div>

                      {/* Validation badge */}
                      {msg.validation && !msg.isLoading && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              background: msg.validation.is_valid ? "#dcfce7" : "#fee2e2",
                              color: msg.validation.is_valid ? "#166534" : "#991b1b",
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontWeight: 700,
                            }}
                          >
                            {msg.validation.is_valid ? "✅ Valid" : "⚠️ Flagged"} — Score: {(msg.validation.confidence * 100).toFixed(0)}%
                          </span>
                          {msg.validation.issues?.length > 0 && (
                            <span style={{ fontSize: 11, color: "#991b1b", padding: "2px 8px", background: "#fff1f2", borderRadius: 10 }}>
                              ⚠️ {msg.validation.issues.join(" · ")}
                            </span>
                          )}
                          {msg.validation.suggestions?.length > 0 && (
                            <span style={{ fontSize: 11, color: "#1d4ed8", padding: "2px 8px", background: "#eff6ff", borderRadius: 10 }}>
                              💡 {msg.validation.suggestions[0]}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && !msg.isLoading && (
                        <details style={{ marginTop: 6 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, color: "#4f46e5", fontWeight: 600 }}>
                            📖 {msg.sources.length} sumber referensi
                          </summary>
                          <div style={{ background: "#f8f9ff", border: "1px solid #e0e7ff", borderRadius: 8, padding: 10, marginTop: 4 }}>
                            {msg.sources.map((s, i) => (
                              <div key={i} style={{ fontSize: 12, color: "#6b7280", padding: "4px 0", borderBottom: i < msg.sources!.length - 1 ? "1px solid #e0e7ff" : "none" }}>
                                <strong style={{ color: "#4f46e5" }}>Hal. {(s.metadata?.page as number) || "?"}</strong>: {s.content.slice(0, 120)}...
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                  placeholder="Ketik pertanyaan untuk test sistem RAG..."
                  disabled={chatLoading}
                  style={{
                    flex: 1,
                    border: "2px solid #e0e7ff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    fontSize: 14,
                    outline: "none",
                    fontFamily: "inherit",
                    background: "white",
                    color: "#111",
                  }}
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    background: chatLoading || !chatInput.trim() ? "#e0e7ff" : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 20px",
                    color: "white",
                    fontWeight: 700,
                    cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                  }}
                >
                  Kirim →
                </button>
              </div>
            </div>
          )}

          {/* ── QUIZ ──────────────────────────────────────────────────── */}
          {tab === "quiz" && (
            <div>
              <h2 style={heading2}>📝 Generate & Preview Kuis</h2>
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {/* Pilih Bab */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Bab:</label>
                    <select
                      value={selectedBab ?? ""}
                      onChange={(e) => setSelectedBab(e.target.value === "" ? null : Number(e.target.value))}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "2px solid #4f46e5",
                        background: "white",
                        color: "#4f46e5",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        fontSize: 14,
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <option value="">Semua Bab</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => (
                        <option key={b} value={b}>Bab {b}</option>
                      ))}
                    </select>
                  </div>
                  {/* Jumlah Soal */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Jumlah soal:</label>
                    {[3, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setQuizCount(n)}
                        style={{
                          padding: "6px 16px",
                          borderRadius: 8,
                          border: "2px solid #4f46e5",
                          background: quizCount === n ? "#4f46e5" : "white",
                          color: quizCount === n ? "white" : "#4f46e5",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 14,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleGenerateQuiz}
                    disabled={quizLoading || !bookStatus?.book_uploaded}
                    style={{
                      padding: "8px 24px",
                      background: quizLoading ? "#e0e7ff" : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                      border: "none",
                      borderRadius: 10,
                      color: "white",
                      fontWeight: 700,
                      cursor: quizLoading ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      fontSize: 14,
                    }}
                  >
                    {quizLoading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner size={14} color="white" /> Generating...</span> : "✨ Generate Soal"}
                  </button>
                </div>
              </div>

              {quizQuestions.map((q, idx) => (
                <div key={idx} style={{ ...card, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <span
                      style={{
                        background: "#4f46e5",
                        color: "white",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        flexShrink: 0,
                        fontSize: 13,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{q.soal}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: 38 }}>
                    {q.opsi.map((opt, oi) => {
                      const letter = String.fromCharCode(65 + oi);
                      const isKey = q.kunci === letter;
                      return (
                        <div
                          key={oi}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: isKey ? "#ecfdf5" : "#f9fafb",
                            border: isKey ? "1.5px solid #34d399" : "1px solid #e5e7eb",
                            fontSize: 14,
                            color: isKey ? "#065f46" : "#374151",
                            fontWeight: isKey ? 700 : 400,
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: 20 }}>{letter}.</span>
                          {opt}
                          {isKey && <span style={{ marginLeft: "auto", fontSize: 12 }}>✅ Kunci</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, marginLeft: 38, padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
                    <strong>💡 Penjelasan:</strong> {q.penjelasan}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── EVALUATE ──────────────────────────────────────────────── */}
          {tab === "evaluate" && (
            <div>
              <h2 style={heading2}>🔬 Evaluasi RAGAS</h2>

              <div style={card}>
                <h3 style={heading3}>Run Batch Evaluasi</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    Pertanyaan (satu per baris) *
                  </label>
                  <textarea
                    value={ragasQuestions}
                    onChange={(e) => setRagasQuestions(e.target.value)}
                    placeholder="Apa itu fotosintesis?&#10;Dimana air diserap oleh tumbuhan?&#10;Apa fungsi klorofil?"
                    rows={5}
                    style={{
                      width: "100%",
                      border: "1.5px solid #e0e7ff",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 14,
                      fontFamily: "inherit",
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "#111",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    Ground Truth (opsional, satu per baris — harus sama jumlahnya dengan pertanyaan)
                  </label>
                  <textarea
                    value={ragasGroundTruths}
                    onChange={(e) => setRagasGroundTruths(e.target.value)}
                    placeholder="Fotosintesis adalah proses pembuatan makanan oleh tumbuhan...&#10;..."
                    rows={4}
                    style={{
                      width: "100%",
                      border: "1.5px solid #e0e7ff",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 14,
                      fontFamily: "inherit",
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "#111",
                    }}
                  />
                </div>
                <button
                  onClick={handleRunRagas}
                  disabled={ragasLoading || !ragasQuestions.trim()}
                  style={{
                    padding: "10px 28px",
                    background: ragasLoading ? "#e0e7ff" : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    border: "none",
                    borderRadius: 10,
                    color: "white",
                    fontWeight: 700,
                    cursor: ragasLoading ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                  }}
                >
                  {ragasLoading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner size={14} color="white" /> Evaluating...</span> : "🔬 Jalankan Evaluasi"}
                </button>
              </div>

              {ragasResult && (
                <div style={{ ...card, marginTop: 16 }}>
                  <h3 style={heading3}>📊 Hasil Evaluasi</h3>
                  {!ragasResult.ragas_available && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e" }}>
                      ⚠️ RAGAS tidak tersedia — menampilkan hasil fallback
                    </div>
                  )}
                  {ragasResult.total_evaluated !== undefined && (
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                      Total dievaluasi: <strong>{ragasResult.total_evaluated}</strong> sampel
                    </div>
                  )}
                  {Object.entries(ragasResult?.aggregate_scores ?? {}).map(([key, val]) => {
                    if (typeof val === "number") {
                      const pct = Math.round(val * 100);
                      return (
                        <div key={key} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{key}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: pct >= 70 ? "#065f46" : pct >= 40 ? "#92400e" : "#7f1d1d" }}>
                              {pct}%
                            </span>
                          </div>
                          <div style={{ height: 8, background: "#e0e7ff", borderRadius: 4, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444",
                                borderRadius: 4,
                                transition: "width 0.5s",
                              }}
                            />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "#4f46e5", fontWeight: 600 }}>Raw JSON</summary>
                    <pre style={{ background: "#0f172a", color: "#e2e8f0", borderRadius: 8, padding: 12, fontSize: 11, overflow: "auto", marginTop: 8 }}>
                      {JSON.stringify(ragasResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {ragasSummary && (
                <div style={{ ...card, marginTop: 16 }}>
                  <h3 style={heading3}>📋 Riwayat Evaluasi</h3>
                  {(ragasSummary as Record<string, unknown>).message ? (
                    <div style={{ textAlign: "center", padding: "28px 0", color: "#9ca3af" }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Belum ada evaluasi RAGAS</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Jalankan evaluasi di atas untuk mengisi riwayat ini.</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                        Total evaluasi tersimpan:{" "}
                        <strong style={{ color: "#1e1b4b" }}>
                          {String((ragasSummary as Record<string, unknown>).total_ragas_evaluations ?? 0)}
                        </strong>
                      </div>
                      {Object.entries(
                        ((ragasSummary as Record<string, unknown>).average_scores as Record<string, number>) ?? {}
                      ).map(([key, val]) => {
                        if (typeof val !== "number") return null;
                        const pct = Math.round(val * 100);
                        return (
                          <div key={key} style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "capitalize" }}>
                                {key.replace(/_/g, " ")}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 70 ? "#065f46" : pct >= 40 ? "#92400e" : "#7f1d1d" }}>
                                {pct}%
                              </span>
                            </div>
                            <div style={{ height: 8, background: "#e0e7ff", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444",
                                borderRadius: 4,
                                transition: "width 0.5s",
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CONFIG ────────────────────────────────────────────────── */}
          {tab === "config" && (
            <div>
              <h2 style={heading2}>⚙️ Konfigurasi Sistem</h2>
              {configLoading ? (
                <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                  <Spinner size={24} />
                  <span style={{ marginLeft: 12, color: "#6b7280", fontSize: 14 }}>Memuat konfigurasi...</span>
                </div>
              ) : config ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {Object.entries(config as Record<string, unknown>).map(([section, val]) => (
                    <div key={section} style={card}>
                      <h3 style={{ ...heading3, textTransform: "capitalize" }}>{section}</h3>
                      <pre style={{ background: "#0f172a", color: "#e2e8f0", borderRadius: 8, padding: 12, fontSize: 12, overflow: "auto", lineHeight: 1.5 }}>
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "#6b7280", marginTop: 40 }}>Memuat konfigurasi...</div>
              )}
            </div>
          )}
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes progress-bar { 0%{margin-left:-60%} 100%{margin-left:100%} }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input, textarea, select { color: #111 !important; }
        input::placeholder, textarea::placeholder { color: #9ca3af !important; }
      `}</style>
    </div>
  );
}

function StatCard({ icon, title, value, color, bg }: { icon: string; title: string; value: string; color: string; bg: string }) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${color}30`,
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      </div>
    </div>
  );
}

const heading2: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: "#1e1b4b",
  marginBottom: 20,
  marginTop: 0,
};

const heading3: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 12,
  marginTop: 0,
};

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: 20,
  border: "1px solid #e0e7ff",
  boxShadow: "0 2px 12px rgba(79,70,229,0.06)",
};

function Spinner({ size = 18, color = "#4f46e5" }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}30`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}