import { Link } from "@tanstack/react-router";
import { usePlayer } from "@/hooks/use-player";
import { LogOut } from "lucide-react";

export function SiteHeader() {
  const { player, signOut } = usePlayer();
  return (
    <header className="bg-ink text-primary-foreground sticky top-0 z-40 border-b-4 border-primary">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="bg-primary px-2 py-1 text-xs font-extrabold tracking-wide rounded-sm">WC26</span>
          <span className="font-bold tracking-tight text-sm sm:text-base group-hover:underline">
            Predictor
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3 text-sm font-semibold">
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
          {player && (
            <div className="flex items-center gap-2 ml-2 pl-2 sm:pl-3 border-l border-white/20">
              <span className="text-xs opacity-80 hidden sm:inline">Playing as</span>
              <span className="text-sm font-bold truncate max-w-[100px]">{player.name}</span>
              <button
                onClick={signOut}
                title="Switch player"
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