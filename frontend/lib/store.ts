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
  refresh_token: string | null;
  email: string | null;
  setAuth: (token: string, email: string, refreshToken?: string | null) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refresh_token: null,
      email: null,
      setAuth: (token, email, refreshToken) =>
        set({ token, email, refresh_token: refreshToken ?? null }),
      logout: () => set({ token: null, email: null, refresh_token: null }),
    }),
    { name: "raybags-auth" },
  ),
);

interface CookieConsentState {
  decided: boolean;
  analytics: boolean;
  functional: boolean;
  acceptAll: () => void;
  declineAll: () => void;
  decide: (analytics: boolean, functional: boolean) => void;
}

export const useCookieConsent = create<CookieConsentState>()(
  persist(
    (set) => ({
      decided: false,
      analytics: false,
      functional: false,
      acceptAll: () => set({ decided: true, analytics: true, functional: true }),
      declineAll: () => set({ decided: true, analytics: false, functional: false }),
      decide: (analytics, functional) => set({ decided: true, analytics, functional }),
    }),
    { name: "raybags-cookie-consent" },
  ),
);
