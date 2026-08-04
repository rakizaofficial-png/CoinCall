"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { loginWithGoogle, register } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) { setError("Display name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading("email");
    try {
      await register(email.trim(), password, displayName.trim());
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(null);
    }
  };

  const googleSignIn = async () => {
    setError(null);
    setLoading("google");
    try {
      await loginWithGoogle();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(null);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan/30 to-teal/20 text-3xl shadow-[0_0_32px_rgba(0,240,255,0.2)]">
            🌟
          </div>
          <h1 className="font-display text-2xl font-extrabold text-sand">Create account</h1>
          <p className="mt-1 text-sm text-muted">Join Luma — live, calls & more</p>
        </div>

        <GoogleSignInButton
          disabled={loading !== null}
          busy={loading === "google"}
          onClick={() => void googleSignIn()}
        />

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">or create with email</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Display Name
            </label>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="auth-input"
              disabled={loading !== null}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              disabled={loading !== null}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="auth-input pr-12"
                disabled={loading !== null}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading !== null} className="btn-primary mt-2">
            <UserPlus className="h-4 w-4" />
            {loading === "email" ? "Creating account…" : "Create email account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-coral">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-ink-2/50 px-4 py-3 text-center">
          <p className="text-xs text-muted/70">
            By creating an account you agree to our Terms & Privacy Policy.
          </p>
        </div>
      </div>
    </main>
  );
}
