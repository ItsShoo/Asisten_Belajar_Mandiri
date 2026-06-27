"use client";
import { useState, useEffect } from "react";
import LoginPage from "@/components/LoginPage";
import StudentDashboard from "@/components/StudentDashboard";
import TeacherDashboard from "@/components/TeacherDashboard";

type Role = "guru" | "siswa" | null;

export default function Home() {
  const [role, setRole]   = useState<Role>(null);
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    const savedRole  = localStorage.getItem("role");
    const savedToken = localStorage.getItem("token") ?? "";
    // Validate role is strictly "guru" or "siswa" before restoring session
    if ((savedRole === "guru" || savedRole === "siswa") && savedToken) {
      setRole(savedRole);
      setToken(savedToken);
    } else if (savedRole || savedToken) {
      // Clear corrupt / stale session data
      localStorage.removeItem("role");
      localStorage.removeItem("token");
    }
  }, []);

  const handleLogin = (userRole: "guru" | "siswa", userToken: string) => {
    localStorage.setItem("role",  userRole);
    localStorage.setItem("token", userToken);
    setRole(userRole);
    setToken(userToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("token");
    setRole(null);
    setToken("");
  };

  if (!role)               return <LoginPage onLogin={handleLogin} />;
  if (role === "siswa")    return <StudentDashboard token={token} onLogout={handleLogout} />;
  return <TeacherDashboard token={token} onLogout={handleLogout} />;
}