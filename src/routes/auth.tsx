import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in – World Cup 2026 Predictor" },
      { name: "description", content: "Sign in or create an account to predict every 2026 World Cup match." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(40, "Keep it under 40 characters"),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const parsed = z.string().trim().email("Enter a valid email").max(255).safeParse(email);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0].message);
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Check your email for a reset link");
        setMode("signin");
      } else if (mode === "signup") {
        const parsed = signUpSchema.safeParse({ email, password, displayName });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0].message);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: parsed.data.displayName },
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Account created");
        navigate({ to: "/" });
      } else {
        const parsed = signInSchema.safeParse({ email, password });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0].message);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
          toast.error(error.message);
          return;
        }
        navigate({ to: "/" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return; // browser navigating away
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md bg-card border border-border rounded-md shadow-sm">
        <div className="bg-primary text-primary-foreground p-5 rounded-t-md flex items-center gap-3">
          <Trophy className="h-6 w-6" />
          <div>
            <h1 className="font-extrabold text-xl tracking-tight leading-none">World Cup 2026</h1>
            <p className="text-xs opacity-90 mt-1">Predictor</p>
          </div>
        </div>

        <div className="px-6 pt-6">
          <div className="grid grid-cols-2 bg-surface rounded-sm p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={
                "py-1.5 rounded-sm transition-colors " +
                (mode === "signin" || mode === "forgot" ? "bg-card shadow-sm text-ink" : "text-muted-foreground")
              }
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={
                "py-1.5 rounded-sm transition-colors " +
                (mode === "signup" ? "bg-card shadow-sm text-ink" : "text-muted-foreground")
              }
            >
              Create account
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-semibold mb-2 text-ink">Display name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Chris Sutton"
                maxLength={40}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Shown on the leaderboard.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold mb-2 text-ink">Email</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-ink">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}
          {mode === "forgot" && (
            <p className="text-xs text-muted-foreground">
              Enter your email and we'll send you a link to reset your password.
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full font-bold">
            {busy
              ? "Please wait…"
              : mode === "signup"
              ? "Create account"
              : mode === "forgot"
              ? "Send reset link"
              : "Sign in"}
          </Button>
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="block w-full text-center text-xs font-semibold text-muted-foreground hover:underline"
            >
              Back to sign in
            </button>
          )}

          {mode !== "forgot" && (
          <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            OR
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full font-semibold"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
            </svg>
            Continue with Google
          </Button>
          </>
          )}

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">Back home</Link>
          </p>
        </form>
      </div>
    </div>
  );
}