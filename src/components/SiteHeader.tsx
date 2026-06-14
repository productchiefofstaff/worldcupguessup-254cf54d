import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { LogOut } from "lucide-react";

export function SiteHeader() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/auth")) return null;
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
  return (
    <header className="sticky top-0 z-40 text-primary-foreground border-b-4 border-primary">
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          <Link to="/" className="block text-center">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              World Cup Guess Up
            </h1>
          </Link>
        </div>
      </div>
      <div className="bg-ink max-w-full px-4 pb-2 pt-2">
        <nav className="max-w-3xl mx-auto flex items-center justify-start gap-1 sm:gap-3 text-sm font-semibold overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            to="/"
            className="px-2 py-1 hover:text-primary"
            activeOptions={{ exact: true }}
            activeProps={{ className: "px-2 py-1 text-primary underline underline-offset-4" }}
          >
            Fixtures
          </Link>
          <Link
            to="/leaderboard"
            className="px-2 py-1 hover:text-primary"
            activeProps={{ className: "px-2 py-1 text-primary underline underline-offset-4" }}
          >
            Leaderboard
          </Link>
          <Link
            to="/my-predictions"
            className="px-2 py-1 hover:text-primary"
            activeProps={{ className: "px-2 py-1 text-primary underline underline-offset-4" }}
          >
            My Predictions
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="px-2 py-1 hover:text-primary"
              activeProps={{ className: "px-2 py-1 text-primary underline underline-offset-4" }}
            >
              Admin
            </Link>
          )}
          {user && (
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
          )}
        </nav>
      </div>
    </header>
  );
}