"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePassword, getMe, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/admin/Toast";

export default function AccountPage() {
  const token = useAuth((s) => s.token)!;
  const setAuth = useAuth((s) => s.setAuth);
  const qc = useQueryClient();
  const toast = useToast();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe(token) });

  const [profile, setProfile] = useState({ full_name: "", email: "" });
  const [pw, setPw] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
    auth_token: "",
  });

  useEffect(() => {
    if (me) setProfile({ full_name: me.full_name || "", email: me.email });
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: () => updateProfile(token, profile),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      if (profile.email) setAuth(token, profile.email);
      toast.success("Profile updated");
    },
    onError: (e) => toast.error("Could not update profile", e),
  });

  const savePw = useMutation({
    mutationFn: () => changePassword(token, pw),
    onSuccess: () => {
      setPw({ current_password: "", new_password: "", confirm_password: "", auth_token: "" });
      toast.success("Password changed");
    },
    onError: (e) => toast.error("Could not change password", e),
  });

  const cls = "w-full mt-1 rounded-theme bg-bg border border-white/15 px-3 py-2";

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="font-heading font-bold text-2xl">Account</h1>

      <section className="rounded-theme bg-surface border border-white/10 p-5 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <label className="block">
          <span className="text-sm">Name</span>
          <input
            value={profile.full_name}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            className={cls}
          />
        </label>
        <label className="block">
          <span className="text-sm">Email (username)</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            className={cls}
          />
        </label>
        {me?.is_superuser && <p className="text-xs text-muted">Role: administrator</p>}
        <button
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending}
          className="rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
        >
          {saveProfile.isPending ? "Saving…" : "Save profile"}
        </button>
      </section>

      <section className="rounded-theme bg-surface border border-white/10 p-5 space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <input
          type="password"
          placeholder="Current password"
          value={pw.current_password}
          onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
          className={cls}
        />
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={pw.new_password}
          onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
          className={cls}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={pw.confirm_password}
          onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })}
          className={cls}
        />
        <input
          type="password"
          placeholder="Auth token (CUSTOM_AUTH_TOKEN)"
          value={pw.auth_token}
          onChange={(e) => setPw({ ...pw, auth_token: e.target.value })}
          className={cls}
        />
        <p className="text-xs text-muted">
          Required: the password only changes when this matches the server&apos;s
          <code className="text-accent"> CUSTOM_AUTH_TOKEN</code>.
        </p>
        <button
          onClick={() => savePw.mutate()}
          disabled={savePw.isPending}
          className="rounded-theme bg-primary text-white px-4 py-2 disabled:opacity-50"
        >
          {savePw.isPending ? "Updating…" : "Update password"}
        </button>
      </section>

      <section className="rounded-theme border border-white/10 p-5 text-sm text-muted">
        <h2 className="font-semibold text-fg mb-1">Lost access?</h2>
        <p>
          An emergency reset is available out-of-band at{" "}
          <code className="text-accent">POST /api/v1/auth/emergency-reset</code> using the{" "}
          <code className="text-accent">CUSTOM_AUTH_TOKEN</code> server secret (email + new
          password). Keep that token private.
        </p>
      </section>
    </div>
  );
}
