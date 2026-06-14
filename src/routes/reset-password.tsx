import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password – World Cup 2026 Predictor" },
      { name: "description", content: "Set a new password for your account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash on load and emits
    // a PASSWORD_RECOVERY event. Until then, getSession() may be empty.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().min(6, "Password must be at least 6 characters").max(72).safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md bg-card border border-border rounded-md shadow-sm">
        <div className="bg-primary text-primary-foreground p-5 rounded-t-md flex items-center gap-3">
          <Trophy className="h-6 w-6" />
          <div>
            <h1 className="font-extrabold text-xl tracking-tight leading-none">Reset password</h1>
            <p className="text-xs opacity-90 mt-1">Choose a new password</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!ready && (
            <p className="text-sm text-muted-foreground">
              Verifying your reset link…
            </p>
          )}
          <div>
            <label className="block text-sm font-semibold mb-2 text-ink">New password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={!ready}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 text-ink">Confirm password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              disabled={!ready}
            />
          </div>
          <Button type="submit" disabled={busy || !ready} className="w-full font-bold">
            {busy ? "Updating…" : "Update password"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/auth" className="hover:underline">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}