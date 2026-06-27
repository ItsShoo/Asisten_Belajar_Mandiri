const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 3_600_000;
const CHAT_TIMEOUT_MS = 3_600_000;
const QUIZ_TIMEOUT_MS = 3_600_000;

export const GURU_TOKEN  = process.env.NEXT_PUBLIC_GURU_TOKEN  ?? "Guru2026";
export const SISWA_TOKEN = process.env.NEXT_PUBLIC_SISWA_TOKEN ?? "Siswa2026";

// FIX KRITIS 1: Tambahkan TOKENS object yang dipakai oleh kedua Dashboard
// StudentDashboard dan TeacherDashboard import { TOKENS } dan pakai TOKENS.siswa / TOKENS.guru
export const TOKENS = {
  guru:  GURU_TOKEN,
  siswa: SISWA_TOKEN,
} as const;


// ============================================================
// TYPES — sesuai Pydantic models di backend
// ============================================================

export type Role = "guru" | "siswa";

/** Satu soal kuis pilihan ganda */
export interface QuizQuestion {
  soal:       string;
  opsi:       string[];
  kunci:      "A" | "B" | "C" | "D";
  penjelasan: string;
}

export interface QuizResponse {
  status:    string;
  quiz:      QuizQuestion[];   
  total?:    number;
  requested?: number;
  bab_filter?: string | null;
  timestamp?: string;
  message?:  string;           
}

/** Request body untuk POST /chat */
export interface ChatRequest {
  prompt:              string;
  include_sources?:    boolean;
  include_validation?: boolean;
  run_ragas?:          boolean;
  ground_truth?:       string | null;
}

/** Satu sumber dokumen yang dikembalikan dari /chat */
export interface ChatSource {
  index?:   number;
  content:  string;
  metadata: Record<string, unknown>;
}

// FIX MINOR 6: Tambahkan field is_toxic sesuai respons backend
// Backend mengirim { answer, is_toxic, category, is_valid, relevance_score, sources, ... }
export interface ChatResponse {
  answer:              string;
  is_toxic:            boolean;           // ← FIX: ganti blocked → is_toxic
  category?:           string | null;     // S1–S5 saat toxic
  is_valid?:           boolean;
  relevance_score?:    number;
  relevance_details?:  Record<string, number>;
  anti_hallucination?: Record<string, unknown>;
  validation?:         ValidationResult;  // ← pakai tipe spesifik, bukan Record
  sources?:            ChatSource[];
  metrics?:            Record<string, unknown>;
  ragas?:              Record<string, unknown>;
  error?:              string;
  timestamp?:          string;
}

// FIX BUG 4 (TeacherDashboard): Tipe validasi sesuai backend
// Backend mengirim { is_valid, confidence, issues[], suggestions[], word_count, context_overlap }
export interface ValidationResult {
  is_valid:        boolean;    // ← bukan "passed"
  confidence:      number;     // ← bukan "score" (0.0–1.0)
  issues:          string[];
  suggestions:     string[];
  word_count:      number;
  context_overlap: number;
}

/** Response dari GET /status */
export interface StatusResponse {
  book_uploaded: boolean;
  chain_ready:   boolean;
  message:       string;
}

/** Satu entri di registry buku (dari GET /books) */
export interface BookInfo {
  book_id:          string;
  filename:         string;
  uploaded_at:      string;
  db_dir:           string;
  total_chunks:     number;
  total_elements?:  number;
  avg_chunk_size?:  number;
  processing_time?: number;
  is_active:        boolean;
}

export interface BooksResponse {
  books: BookInfo[];
  total: number;
}

/** Request body untuk POST /evaluate/ragas */
export interface RAGASEvaluationRequest {
  questions:      string[];
  ground_truths?: string[];
}

// FIX MINOR 7: Tipe respons RAGAS sesuai struktur backend
// Backend mengembalikan { ragas_available, total_evaluated, aggregate_scores:{}, per_sample_scores:[], timestamp }
export interface RAGASEvaluationResponse {
  ragas_available:   boolean;
  total_evaluated?:  number;
  aggregate_scores?: Record<string, number>;   // ← skor ada di sini, bukan di root
  per_sample_scores?: Record<string, unknown>[];
  timestamp?:        string;
  error?:            string;
}

/** Response dari GET /statistics */
export type StatisticsResponse = Record<string, unknown>;

/** Response dari GET /config */
export type ConfigResponse = Record<string, unknown>;

/** Response dari GET / */
export interface RootResponse {
  status:               string;
  version:              string;
  features:             string[];
  ragas_available:      boolean;
  llm_model:            string;
  llama_guard_model:    string;
  llama_guard_enabled:  boolean;
  docs_url:             string;
  auth_header:          string;
  roles:                Record<Role, string>;
}


// ============================================================
// INTERNAL HELPER
// ============================================================

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function extractErrorDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

function buildNgrokAuthMessage(path: string, code?: string | null): string {
  const codeSuffix = code ? ` (${code})` : "";
  return `Ngrok tunnel belum terhubung ke backend${codeSuffix}. Endpoint ${path} mengembalikan halaman HTML, bukan JSON API. Pastikan agent ngrok aktif di mesin backend dan tunnel diarahkan ke port backend yang benar.`;
}

function parseResponsePayload(rawBody: string, contentType: string): unknown {
  const text = rawBody.trim();
  if (!text) return null;

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  // Beberapa proxy salah set content-type, jadi kita tetap coba parse JSON jika body tampak JSON.
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return JSON.parse(text);
  }

  return text;
}

async function handleResponse<T>(
  res: Response,
  path: string,
  toError: (status: number, message: string) => Error,
): Promise<T> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const ngrokErrorCode = res.headers.get("ngrok-error-code");
  const rawBody = await res.text();
  const bodyLower = rawBody.toLowerCase();

  const looksLikeNgrokHtml =
    Boolean(ngrokErrorCode?.startsWith("ERR_NGROK_")) ||
    bodyLower.includes("err_ngrok_") ||
    bodyLower.includes("ngrok") ||
    (contentType.includes("text/html") && rawBody.trim().startsWith("<"));

  if (looksLikeNgrokHtml) {
    throw toError(502, buildNgrokAuthMessage(path, ngrokErrorCode));
  }

  let payload: unknown;
  try {
    payload = parseResponsePayload(rawBody, contentType);
  } catch {
    throw toError(502, `Response backend untuk ${path} bukan JSON yang valid.`);
  }

  if (!res.ok) {
    const detail = extractErrorDetail(payload);
    throw toError(res.status, detail ?? res.statusText);
  }

  if (payload === null) {
    throw toError(502, `Response backend untuk ${path} kosong.`);
  }

  if (typeof payload === "string") {
    throw toError(502, `Response backend untuk ${path} bukan JSON.`);
  }

  return payload as T;
}

async function request<T>(
  path: string,
  token: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "X-Auth-Token": token,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...fetchOptions.headers,
      },
    });
    return handleResponse<T>(res, path, (status, message) => new ApiError(status, message));
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, "Request timeout. Backend mungkin tidak aktif atau tunnel terputus.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function publicRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...fetchOptions.headers,
      },
    });
    return handleResponse<T>(res, path, (_status, message) => new Error(message));
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout. Backend mungkin tidak aktif atau tunnel terputus.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================

/** Response dari POST /auth/verify */
export interface AuthVerifyResponse {
  valid:   boolean;
  role?:   string;
  message: string;
}

/**
 * Validasi token + role di backend sebelum login.
 * Mencegah siswa login pakai token guru dan sebaliknya.
 */
export async function verifyAuth(token: string, role: string): Promise<AuthVerifyResponse> {
  try {
    return await publicRequest<AuthVerifyResponse>("/auth/verify", {
      method: "POST",
      timeoutMs: 10_000,
      body: JSON.stringify({ token, role }),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Request timeout")) {
      throw new Error("VERIFY_TIMEOUT");
    }
    throw err;
  }
}

export async function getRoot(token: string): Promise<RootResponse> {
  return request<RootResponse>("/", token);
}

/**
 * Cek status buku — endpoint PUBLIC, tidak perlu auth token.
 * Menghindari 403 dari proxy/IIS yang reject header auth tidak dikenali.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getStatus(_token?: string): Promise<StatusResponse> {
  return publicRequest<StatusResponse>("/status", { timeoutMs: 8_000 });
}


// ============================================================
// GURU & SISWA ENDPOINTS
// ============================================================

interface ChatJobStartResponse {
  job_id:  string;
  status:  "processing";
  message: string;
}

interface ChatJobStatusResponse {
  job_id:  string;
  status:  "processing" | "done" | "error";
  result?: ChatResponse | null;
  error?:  string | null;
}

export async function sendChat(
  token: string,
  prompt: string,
  options: Omit<ChatRequest, "prompt"> = {},
): Promise<ChatResponse> {
  // POST /chat returns a job_id immediately (avoids ngrok timeout on long LLM calls)
  const job = await request<ChatJobStartResponse>("/chat", token, {
    method: "POST",
    timeoutMs: CHAT_TIMEOUT_MS,   // keep full timeout — old backend is synchronous
    body: JSON.stringify({
      include_sources:    true,
      include_validation: true,
      run_ragas:          false,
      ...options,
      prompt,
    }),
  });

  // Poll GET /chat/status/{job_id} until done
  const pollMs = 3_000;
  const deadline = Date.now() + CHAT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));

    const status = await request<ChatJobStatusResponse>(
      `/chat/status/${job.job_id}`,
      token,
      { timeoutMs: DEFAULT_TIMEOUT_MS },
    );

    if (status.status === "done") {
      if (!status.result) throw new ApiError(500, "Chat selesai tapi tidak ada hasil.");
      return status.result;
    }
    if (status.status === "error") {
      throw new ApiError(500, status.error ?? "Chat gagal di backend.");
    }
    // still "processing" — continue polling
  }

  throw new ApiError(408, "Chat timeout — backend tidak merespon dalam waktu yang ditentukan.");
}

export async function getQuiz(
  token: string,
  n?: number,
  bab?: string,
): Promise<QuizResponse> {
  const params = new URLSearchParams();
  if (n   !== undefined) params.set("n",   String(n));
  if (bab !== undefined) params.set("bab", bab);

  const query = params.toString() ? `?${params.toString()}` : "";
  return request<QuizResponse>(`/quiz${query}`, token, {
    timeoutMs: QUIZ_TIMEOUT_MS,
  });
}


// ============================================================
// GURU-ONLY ENDPOINTS
// ============================================================

export interface UploadJobResponse {
  job_id:  string;
  status:  "processing" | "done" | "error";
  message: string;
}

export interface UploadStatusResponse {
  job_id:  string;
  status:  "processing" | "done" | "error";
  result?: Record<string, unknown> | null;
  error?:  string | null;
}

export async function startUpload(
  guruToken: string,
  file: File,
): Promise<UploadJobResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadJobResponse>("/upload", guruToken, {
    method: "POST",
    body:   form,
  });
}

export async function getUploadStatus(
  guruToken: string,
  jobId: string,
): Promise<UploadStatusResponse> {
  return request<UploadStatusResponse>(`/upload/status/${jobId}`, guruToken);
}

// tetap export uploadBook agar tidak ada import lain yang rusak
export const uploadBook = startUpload;
export const uploadPDF  = startUpload;

export async function evaluateRAGAS(
  guruToken: string,
  body: RAGASEvaluationRequest,
): Promise<RAGASEvaluationResponse> {
  return request<RAGASEvaluationResponse>("/evaluate/ragas", guruToken, {
    method:    "POST",
    body:      JSON.stringify(body),
    timeoutMs: DEFAULT_TIMEOUT_MS, // 10 menit — RAGAS butuh 2-10 menit per batch
  });
}


export const runRagasEvaluation = async (
  guruToken: string,
  questions: string[],
  ground_truths?: string[],
): Promise<RAGASEvaluationResponse> =>
  evaluateRAGAS(guruToken, { questions, ground_truths });

export async function getRAGASSummary(
  guruToken: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/evaluate/ragas/summary", guruToken);
}

// Alias yang dipakai TeacherDashboard
export const getRagasSummary = getRAGASSummary;

export async function getStatistics(
  guruToken: string,
): Promise<StatisticsResponse> {
  return request<StatisticsResponse>("/statistics", guruToken);
}

export async function getConfig(
  guruToken: string,
): Promise<ConfigResponse> {
  return request<ConfigResponse>("/config", guruToken);
}

export async function resetDatabase(
  guruToken: string,
): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/reset", guruToken, {
    method: "DELETE",
  });
}


// ============================================================
// BOOK LIBRARY ENDPOINTS
// ============================================================

export async function getBooks(
  guruToken: string,
): Promise<BooksResponse> {
  return request<BooksResponse>("/books", guruToken);
}

export async function activateBook(
  guruToken: string,
  bookId: string,
): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>(
    `/books/${bookId}/activate`,
    guruToken,
    { method: "POST" },
  );
}

export async function deleteBook(
  guruToken: string,
  bookId: string,
): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>(
    `/books/${bookId}`,
    guruToken,
    { method: "DELETE" },
  );
}


// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export function getToken(role: Role): string {
  return role === "guru" ? GURU_TOKEN : SISWA_TOKEN;
}

export { ApiError };