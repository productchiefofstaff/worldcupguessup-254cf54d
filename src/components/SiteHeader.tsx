import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useEffect, useState } from "react";
import { LogOut, LogIn, CalendarDays, Trophy, ClipboardList, Shield, Dices } from "lucide-react";

export function SiteHeader() {
  const [mounted, setMounted] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMounted(true), []);
  const label = profile?.display_name ?? user?.email ?? "";
  const roleQ = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await db.from("user_roles").select("role").eq("user_id", user!.id);
      return (data ?? []).map((r: { role: string }) => r.role);
    },
  });
  const isAdmin = (roleQ.data ?? []).includes("admin");
  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth" });
  }
  if (!mounted || pathname.startsWith("/auth")) return null;
  return (
    <header className="sticky top-0 z-40 text-primary-foreground border-b border-white/5">
      <div className="bg-ink text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          <Link to="/" className="block text-center">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              <span className="text-primary">🏆</span> 2026 World Cup{" "}
              <span className="text-primary">Guess Up</span>
            </h1>
          </Link>
        </div>
      </div>
      <div className="bg-ink/95 max-w-full px-4 pb-2 pt-1 border-t border-white/5">
        <nav className="max-w-3xl mx-auto flex items-center justify-start gap-1 sm:gap-2 text-sm font-semibold overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/5"
            activeOptions={{ exact: true }}
            activeProps={{ className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/15 text-primary" }}
          >
            <CalendarDays className="h-4 w-4" />
            Fixtures
          </Link>
          <Link
            to="/leaderboard"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/5"
            activeProps={{ className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/15 text-primary" }}
          >
            <Trophy className="h-4 w-4" />
            Leaderboard
          </Link>
          <Link
            to="/my-predictions"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/5"
            activeProps={{ className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/15 text-primary" }}
          >
            <ClipboardList className="h-4 w-4" />
            Predictions
          </Link>
          <Link
            to="/luckbox"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/5"
            activeProps={{ className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/15 text-primary" }}
          >
            <Dices className="h-4 w-4" />
            LuckBox
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/5"
              activeProps={{ className: "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/15 text-primary" }}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2 ml-2 pl-2 sm:pl-3 border-l border-white/20 shrink-0">
              <span className="text-xs opacity-80 hidden sm:inline">Playing as</span>
              <span className="text-sm font-bold truncate max-w-[100px]">{label}</span>
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="opacity-70 hover:opacity-100"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}