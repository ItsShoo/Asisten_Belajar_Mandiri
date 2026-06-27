"use client";

import { useState, useEffect, useRef } from "react";
import { sendChat, getQuiz, getStatus, TOKENS, type ChatSource } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  isLoading?: boolean;
  isToxic?: boolean;
  toxicMessage?: string;
};

type QuizQuestion = {
  soal: string;
  opsi: string[];
  kunci: string;
  penjelasan: string;
};

type Tab = "chat" | "quiz";

const AVATAR_STUDENT = "🐸";
const AVATAR_BOT = "🤖";

export default function StudentDashboard({ token: _token, onLogout }: { token?: string; onLogout?: () => void }) {
  const token = _token?.trim() || TOKENS.siswa;
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Halo! Aku adalah Asisten Belajarmu 🎉 Tanyakan apa saja tentang pelajaran kamu, dan aku akan bantu jawab dengan informasi dari buku pelajaranmu!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bookReady, setBookReady] = useState<boolean | null>(null);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [quizCount, setQuizCount] = useState(3);
  const [score, setScore] = useState(0);
  const [selectedBab, setSelectedBab] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStatus()
      .then((s) => setBookReady(s.book_uploaded && s.chain_ready))
      .catch(() => setBookReady(false));
    // Poll status every 30 seconds (reduced from 5s to avoid flood)
    const interval = setInterval(() => {
      getStatus()
        .then((s) => setBookReady(s.book_uploaded && s.chain_ready))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", text };
    const loadingMsg: Message = {
      id: Date.now() + "-loading",
      role: "assistant",
      text: "",
      isLoading: true,
    };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const res = await sendChat(token, text);

      if (res.is_toxic) {
        setMessages((prev) =>
        prev.map((m) =>
        m.isLoading
        ? {
            ...m,
            text: res.answer,   // backend taruh pesan edukatif di res.answer saat toxic
            isLoading: false,
            isToxic: true,
          }
        : m
       )
     );
    } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.isLoading
              ? {
                  ...m,
                  text: res.answer,
                  sources: res.sources,
                  isLoading: false,
                }
              : m
          )
        );
      }
    } catch (e: unknown) {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                text: `😕 Oops! Terjadi kesalahan: ${(e as Error).message}`,
                isLoading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handleGenerateQuiz() {
    setQuizLoading(true);
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    try {
      const res = await getQuiz(token, quizCount, selectedBab !== null ? String(selectedBab) : undefined);
      setQuizQuestions(res.quiz || []);
    } catch (e: unknown) {
      alert("Gagal memuat kuis: " + (e as Error).message);
    } finally {
      setQuizLoading(false);
    }
  }

  function handleAnswer(idx: number, opt: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [idx]: opt }));
  }

  function handleSubmitQuiz() {
    let s = 0;
    quizQuestions.forEach((q, i) => {
      if (answers[i] === q.kunci) s++;
    });
    setScore(s);
    setSubmitted(true);
  }

  const allAnswered = quizQuestions.length > 0 && Object.keys(answers).length === quizQuestions.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #fff9f0 0%, #fff0f9 50%, #f0f9ff 100%)",
        fontFamily: "'Nunito', 'Comic Sans MS', cursive, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(90deg, #ff8c42, #ff4d8d, #845ef7)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(132,94,247,0.3)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>📚</span>
          <div>
            <div style={{ color: "white", fontWeight: 900, fontSize: 20, letterSpacing: -0.5 }}>
              Asisten Belajar SD
            </div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              Teman belajar pintarmu! ✨
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: bookReady ? "#4ade80" : "#f87171",
              color: "white",
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {bookReady === null ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Spinner size={12} color="white" /> Memuat...</span>
            ) : bookReady ? "✅ Buku Siap" : "❌ Buku Belum Ada"}
          </div>
          <button
            onClick={() => { if (onLogout) onLogout(); else { localStorage.clear(); window.location.href = "/"; } }}
            style={{
              padding: "6px 16px",
              background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.4)",
              borderRadius: 20,
              color: "white",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          background: "white",
          borderBottom: "3px solid #f0e6ff",
          position: "sticky",
          top: 73,
          zIndex: 40,
        }}
      >
        {(["chat", "quiz"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "14px 0",
              border: "none",
              background: tab === t ? "linear-gradient(135deg, #845ef7, #ff4d8d)" : "transparent",
              color: tab === t ? "white" : "#999",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "inherit",
              borderRadius: tab === t ? "0 0 12px 12px" : 0,
            }}
          >
            {t === "chat" ? "💬 Tanya Yuk!" : "🎯 Kuis Seru!"}
          </button>
        ))}
      </div>

      {/* CHAT TAB */}
      {tab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 10,
                  marginBottom: 16,
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    flexShrink: 0,
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                  }}
                >
                  {msg.role === "user" ? AVATAR_STUDENT : AVATAR_BOT}
                </div>
                <div style={{ maxWidth: "72%" }}>
                  <div
                    style={{
                      background:
                        msg.role === "user"
                          ? "linear-gradient(135deg, #845ef7, #5c7cfa)"
                          : msg.isToxic
                          ? "linear-gradient(135deg, #ff6b6b, #ff4d4d)"
                          : "white",
                      color: msg.role === "user" || msg.isToxic ? "white" : "#333",
                      borderRadius:
                        msg.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                      padding: "12px 16px",
                      fontSize: 15,
                      lineHeight: 1.6,
                      boxShadow:
                        msg.role === "user"
                          ? "0 4px 15px rgba(132,94,247,0.3)"
                          : "0 4px 15px rgba(0,0,0,0.08)",
                      border: msg.role === "assistant" && !msg.isToxic ? "2px solid #f0e6ff" : "none",
                    }}
                  >
                    {msg.isLoading ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#999" }}>Sedang berpikir</span>
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "#845ef7",
                              animation: "bounce 0.8s infinite",
                              animationDelay: `${i * 0.2}s`,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
                    )}
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && !msg.isLoading && (
                    <details style={{ marginTop: 6 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#845ef7",
                          fontWeight: 700,
                          listStyle: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        📖 Lihat sumber ({msg.sources.length})
                      </summary>
                      <div
                        style={{
                          background: "#faf5ff",
                          border: "1px solid #e9d5ff",
                          borderRadius: 10,
                          padding: 10,
                          marginTop: 4,
                        }}
                      >
                        {msg.sources.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 12,
                              color: "#666",
                              padding: "4px 0",
                              borderBottom: i < msg.sources!.length - 1 ? "1px solid #e9d5ff" : "none",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "#845ef7" }}>
                              {(s.metadata?.page as number) ? `Hal. ${s.metadata.page}` : `Sumber ${i + 1}`}
                            </span>
                            : {s.content.slice(0, 100)}...
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

          {/* Input */}
          {bookReady === false && (
            <div
              style={{
                margin: "0 16px 8px",
                background: "#fff3cd",
                border: "2px solid #ffc107",
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 14,
                color: "#856404",
                textAlign: "center",
              }}
            >
              ⏳ Buku belum tersedia. Tunggu gurumu mengunggah buku dulu ya!
            </div>
          )}
          <div
            style={{
              padding: "12px 16px",
              background: "white",
              borderTop: "3px solid #f0e6ff",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Tulis pertanyaanmu di sini... 🤔"
              disabled={isLoading || !bookReady}
              style={{
                flex: 1,
                border: "2px solid #e9d5ff",
                borderRadius: 24,
                padding: "12px 20px",
                fontSize: 15,
                outline: "none",
                fontFamily: "inherit",
                background: "#faf5ff",
                color: "#333",
                transition: "border 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#845ef7")}
              onBlur={(e) => (e.target.style.borderColor = "#e9d5ff")}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim() || !bookReady}
              style={{
                background:
                  isLoading || !input.trim() || !bookReady
                    ? "#ddd"
                    : "linear-gradient(135deg, #845ef7, #ff4d8d)",
                border: "none",
                borderRadius: "50%",
                width: 50,
                height: 50,
                cursor: isLoading || !input.trim() || !bookReady ? "not-allowed" : "pointer",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 15px rgba(132,94,247,0.3)",
                transition: "all 0.2s",
                flexShrink: 0,
              }}
            >
              🚀
            </button>
          </div>
        </div>
      )}

      {/* QUIZ TAB */}
      {tab === "quiz" && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          {/* Quiz Controls */}
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 20,
              marginBottom: 24,
              boxShadow: "0 4px 20px rgba(132,94,247,0.1)",
              border: "3px solid #e9d5ff",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "#845ef7",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🎯 Kuis Seru!
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {/* Pilih Bab */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#666" }}>Bab:</span>
                <select
                  value={selectedBab ?? ""}
                  onChange={(e) => setSelectedBab(e.target.value === "" ? null : Number(e.target.value))}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: "2px solid #845ef7",
                    background: "white",
                    color: "#845ef7",
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
                <span style={{ fontSize: 14, fontWeight: 700, color: "#666" }}>Jumlah soal:</span>
                {[3, 5, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuizCount(n)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 20,
                      border: "2px solid #845ef7",
                      background: quizCount === n ? "#845ef7" : "white",
                      color: quizCount === n ? "white" : "#845ef7",
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 15,
                      transition: "all 0.2s",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerateQuiz}
                disabled={quizLoading || !bookReady}
                style={{
                  background:
                    quizLoading || !bookReady
                      ? "#ddd"
                      : "linear-gradient(135deg, #ff8c42, #ff4d8d)",
                  border: "none",
                  borderRadius: 20,
                  padding: "10px 24px",
                  color: "white",
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: quizLoading || !bookReady ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 15px rgba(255,77,141,0.3)",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {quizLoading ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spinner size={14} color="white" /> Memuat...</span> : "✨ Mulai Kuis!"}
              </button>
            </div>
          </div>

          {/* Score Banner */}
          {submitted && (
            <div
              style={{
                background:
                  score === quizQuestions.length
                    ? "linear-gradient(135deg, #4ade80, #22d3ee)"
                    : score >= quizQuestions.length / 2
                    ? "linear-gradient(135deg, #fbbf24, #fb923c)"
                    : "linear-gradient(135deg, #f87171, #ef4444)",
                borderRadius: 20,
                padding: "20px 24px",
                marginBottom: 24,
                textAlign: "center",
                color: "white",
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {score === quizQuestions.length
                  ? "🏆"
                  : score >= quizQuestions.length / 2
                  ? "⭐"
                  : "💪"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {score} / {quizQuestions.length} Benar!
              </div>
              <div style={{ fontSize: 16, marginTop: 4, opacity: 0.9 }}>
                {score === quizQuestions.length
                  ? "Sempurna! Kamu luar biasa! 🎉"
                  : score >= quizQuestions.length / 2
                  ? "Bagus! Terus semangat belajar! 📚"
                  : "Jangan menyerah, coba lagi ya! 💪"}
              </div>
              <button
                onClick={handleGenerateQuiz}
                style={{
                  marginTop: 16,
                  background: "rgba(255,255,255,0.25)",
                  border: "2px solid white",
                  borderRadius: 20,
                  padding: "8px 24px",
                  color: "white",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                🔄 Coba Lagi!
              </button>
            </div>
          )}

          {/* Quiz Questions */}
          {quizQuestions.map((q, idx) => {
            const userAnswer = answers[idx];
            const isCorrect = submitted && userAnswer === q.kunci;
            const isWrong = submitted && userAnswer && userAnswer !== q.kunci;

            return (
              <div
                key={idx}
                style={{
                  background: "white",
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 16,
                  border: submitted
                    ? isCorrect
                      ? "3px solid #4ade80"
                      : isWrong
                      ? "3px solid #f87171"
                      : "3px solid #e9d5ff"
                    : "3px solid #e9d5ff",
                  boxShadow: "0 4px 15px rgba(0,0,0,0.06)",
                  transition: "all 0.3s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      background: "linear-gradient(135deg, #845ef7, #5c7cfa)",
                      color: "white",
                      borderRadius: "50%",
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      flexShrink: 0,
                      fontSize: 15,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#333", lineHeight: 1.5 }}>
                    {q.soal}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {q.opsi.map((opt, oi) => {
                    const letter = String.fromCharCode(65 + oi); // A,B,C,D
                    const isSelected = userAnswer === letter;
                    const isAnswer = q.kunci === letter;

                    let bg = "white";
                    let border = "2px solid #e9d5ff";
                    let color = "#333";

                    if (submitted) {
                      if (isAnswer) {
                        bg = "#dcfce7";
                        border = "2px solid #4ade80";
                        color = "#166534";
                      } else if (isSelected) {
                        bg = "#fee2e2";
                        border = "2px solid #f87171";
                        color = "#991b1b";
                      }
                    } else if (isSelected) {
                      bg = "#f0e6ff";
                      border = "2px solid #845ef7";
                      color = "#845ef7";
                    }

                    return (
                      <button
                        key={oi}
                        onClick={() => handleAnswer(idx, letter)}
                        disabled={submitted}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 16px",
                          borderRadius: 12,
                          background: bg,
                          border,
                          color,
                          cursor: submitted ? "default" : "pointer",
                          fontFamily: "inherit",
                          fontSize: 15,
                          fontWeight: isSelected || (submitted && isAnswer) ? 700 : 400,
                          textAlign: "left",
                          transition: "all 0.2s",
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: isSelected || (submitted && isAnswer) ? (submitted && isAnswer ? "#4ade80" : isSelected && !isAnswer ? "#f87171" : "#845ef7") : "#f0e6ff",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            flexShrink: 0,
                            fontSize: 13,
                          }}
                        >
                          {letter}
                        </span>
                        {opt}
                        {submitted && isAnswer && <span style={{ marginLeft: "auto" }}>✅</span>}
                        {submitted && isSelected && !isAnswer && <span style={{ marginLeft: "auto" }}>❌</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation after submit */}
                {submitted && (
                  <div
                    style={{
                      marginTop: 12,
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#166534",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>💡 Penjelasan: </span>
                    {q.penjelasan}
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit Button */}
          {quizQuestions.length > 0 && !submitted && (
            <button
              onClick={handleSubmitQuiz}
              disabled={!allAnswered}
              style={{
                width: "100%",
                padding: "16px",
                background: allAnswered
                  ? "linear-gradient(135deg, #845ef7, #ff4d8d)"
                  : "#ddd",
                border: "none",
                borderRadius: 20,
                color: "white",
                fontWeight: 900,
                fontSize: 18,
                cursor: allAnswered ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                boxShadow: allAnswered ? "0 6px 20px rgba(132,94,247,0.4)" : "none",
                transition: "all 0.2s",
                marginTop: 8,
              }}
            >
              {allAnswered ? "✅ Selesai! Cek Nilai!" : `⏳ Jawab semua soal dulu (${Object.keys(answers).length}/${quizQuestions.length})`}
            </button>
          )}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input, textarea, select { color: #111 !important; }
        input::placeholder, textarea::placeholder { color: #9ca3af !important; }
      `}</style>
    </div>
  );
}

function Spinner({ size = 18, color = "#845ef7" }: { size?: number; color?: string }) {
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
        display: "inline-block",
      }}
    />
  );
}