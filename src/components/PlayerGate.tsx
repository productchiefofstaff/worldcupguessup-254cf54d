import { useState, type ReactNode } from "react";
import { usePlayer } from "@/hooks/use-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy } from "lucide-react";

export function PlayerGate({ children }: { children: ReactNode }) {
  const { player, ready, signIn } = usePlayer();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (player) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await signIn(name);
    if (error) setErr(error);
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-md shadow-sm">
        <div className="bg-primary text-primary-foreground p-5 rounded-t-md flex items-center gap-3">
          <Trophy className="h-6 w-6" />
          <div>
            <h1 className="font-extrabold text-xl tracking-tight leading-none">World Cup 2026</h1>
            <p className="text-xs opacity-90 mt-1">Predictor</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-ink">Pick a name to play</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chris Sutton"
              maxLength={40}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground mt-2">
              Used on the leaderboard. If the name already exists you'll log back in as that player.
            </p>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full font-bold">
            {busy ? "Joining…" : "Start predicting"}
          </Button>
        </form>
      </div>
    </div>
  );
}