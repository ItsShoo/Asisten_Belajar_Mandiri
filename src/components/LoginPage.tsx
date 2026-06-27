"use client";
import { useState } from "react";
import { verifyAuth } from "@/lib/api";

interface LoginPageProps {
  onLogin: (userRole: "guru" | "siswa", userToken: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<"guru" | "siswa">("siswa");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token.trim()) {
      setError("Masukkan token terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyAuth(token.trim(), role);
      if (result.valid) {
        // Use backend-confirmed role as the authoritative value
        const confirmedRole = (result.role === "guru" || result.role === "siswa")
          ? result.role
          : role;
        onLogin(confirmedRole, token.trim());
      } else {
        setError(result.message || "Token tidak valid untuk role ini.");
      }
    } catch (err: unknown) {
      // Fallback jika backend belum support /auth/verify (backward compat)
      const message = err instanceof Error ? err.message : "Gagal verifikasi";
      if (
        message.includes("404") ||
        message.includes("Not Found") ||
        message === "VERIFY_TIMEOUT"
      ) {
        // Backend lama tanpa /auth/verify — izinkan login langsung
        onLogin(role, token.trim());
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* CSS global untuk memaksa warna hitam pada select dan option */}
      <style>{`
        select, select option {
          color: black !important;
          background-color: white !important;
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 to-purple-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          {/* Logo dari Canva - simpan di public/logo.png */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Logo BelajarPintar"
              className="w-40 h-auto mx-auto"
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-black font-semibold mb-2">Pilih Peran</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "guru" | "siswa")}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              >
                <option value="siswa">🧒 Siswa</option>
                <option value="guru">👩‍🏫 Guru</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-black font-semibold mb-2">Token</label>
              <input
                type="text"
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(""); }}
                placeholder="Masukkan token Anda"
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-black"
                required
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "Memverifikasi..." : "Masuk ke Dashboard →"}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-4">
             Gunakan token yang diberikan guru / siswa
          </p>
        </div>
      </div>
    </>
  );
}