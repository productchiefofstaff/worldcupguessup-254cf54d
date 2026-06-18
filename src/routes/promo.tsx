import { createFileRoute, Link } from "@tanstack/react-router";
import promoAsset from "@/assets/promo.mp4.asset.json";

export const Route = createFileRoute("/promo")({
  component: PromoPage,
  head: () => ({
    meta: [
      { title: "World Cup Guess Up — Predict. Compete. Win." },
      {
        name: "description",
        content:
          "Predict every World Cup match, climb the leaderboard, and win cash prizes. Watch the trailer.",
      },
      { property: "og:title", content: "World Cup Guess Up" },
      {
        property: "og:description",
        content: "Predict. Compete. Win. The World Cup prediction game.",
      },
      { property: "og:video", content: promoAsset.url },
      { property: "og:type", content: "video.other" },
    ],
  }),
});

function PromoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0E27] text-white">
      {/* ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(255,215,0,0.12), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(0,210,106,0.10), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:py-12">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-sm font-medium tracking-[0.2em] text-white/60 uppercase hover:text-white"
          >
            ← Back
          </Link>
          <div
            className="text-xs font-semibold tracking-[0.3em] uppercase"
            style={{ color: "#FFD700" }}
          >
            Official Trailer
          </div>
        </div>

        {/* heading */}
        <header className="mt-10 sm:mt-16">
          <h1
            className="text-5xl sm:text-7xl font-black uppercase leading-[0.9] tracking-tight"
            style={{ fontFamily: "Bebas Neue, Impact, sans-serif", letterSpacing: "-0.02em" }}
          >
            World Cup
            <br />
            <span style={{ color: "#FFD700" }}>Guess Up</span>
          </h1>
          <p className="mt-4 max-w-xl text-base sm:text-lg text-white/65">
            Predict every match. Beat your mates on the leaderboard.
            First place wins the prize pot.
          </p>
        </header>

        {/* video */}
        <div className="mt-8 sm:mt-12">
          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(255,215,0,0.25)]"
            style={{ aspectRatio: "16/9" }}
          >
            <video
              src={promoAsset.url}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>

        {/* CTA strip */}
        <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <Stat label="Matches" value="64" />
            <Divider />
            <Stat label="Players" value="∞" />
            <Divider />
            <Stat label="Prize" value="£80" highlight />
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg px-8 py-4 text-base font-bold uppercase tracking-[0.15em] transition-transform hover:scale-105"
            style={{
              backgroundColor: "#FFD700",
              color: "#0A0E27",
              fontFamily: "Bebas Neue, Impact, sans-serif",
              letterSpacing: "0.2em",
              fontSize: "1.25rem",
              boxShadow: "0 12px 40px rgba(255,215,0,0.35)",
            }}
          >
            Play Free Now
          </Link>
        </div>

        <footer className="mt-auto pt-12 text-xs uppercase tracking-[0.25em] text-white/30">
          Predict · Compete · Win
        </footer>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className="text-3xl sm:text-4xl font-bold tabular-nums"
        style={{
          fontFamily: "Bebas Neue, Impact, sans-serif",
          color: highlight ? "#FFD700" : "#fff",
          letterSpacing: "0.02em",
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/50">
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px bg-white/15" />;
}