"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Mode = "dark" | "light";

interface UIState {
  mode: Mode | null; // null => follow theme default
  setMode: (m: Mode) => void;
  toggleMode: (fallback: Mode) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      mode: null,
      setMode: (m) => set({ mode: m }),
      toggleMode: (fallback) => {
        const current = get().mode ?? fallback;
        set({ mode: current === "dark" ? "light" : "dark" });
      },
    }),
    { name: "raybags-ui" },
  ),
);

interface AuthState {
  token: string | null;
  email: string | null;
  setAuth: (token: string, email: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      setAuth: (token, email) => set({ token, email }),
      logout: () => set({ token: null, email: null }),
    }),
    { name: "raybags-auth" },
  ),
);
