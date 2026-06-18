import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

const MATCHES = [
  { home: "BRA", away: "ARG", flagH: "#FFD700", flagA: "#75AADB", pick: "2-1" },
  { home: "ENG", away: "FRA", flagH: "#FFFFFF", flagA: "#002395", pick: "1-1" },
  { home: "GER", away: "ESP", flagH: "#000000", flagA: "#AA151B", pick: "0-2" },
];

const FixtureCard: React.FC<{
  index: number;
  match: (typeof MATCHES)[number];
}> = ({ index, match }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 8 + index * 9;
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16, stiffness: 140 },
  });
  const y = interpolate(s, [0, 1], [120, 0]);
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const rot = interpolate(s, [0, 1], [-4, 0]);

  // pick stamp delay
  const stamp = spring({
    frame: frame - (delay + 18),
    fps,
    config: { damping: 8, stiffness: 220 },
  });
  const stampScale = interpolate(stamp, [0, 1], [2.2, 1]);
  const stampOpacity = interpolate(stamp, [0, 0.4, 1], [0, 1, 1]);

  return (
    <div
      style={{
        width: 460,
        height: 220,
        backgroundColor: "#11173A",
        border: "2px solid rgba(255,215,0,0.25)",
        borderRadius: 16,
        padding: 28,
        opacity,
        transform: `translateY(${y}px) rotate(${rot}deg)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          fontWeight: 600,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        Group Stage · MD {index + 1}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#fff",
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 64,
          letterSpacing: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              backgroundColor: match.flagH,
            }}
          />
          {match.home}
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "Inter, sans-serif",
            letterSpacing: 4,
          }}
        >
          VS
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {match.away}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              backgroundColor: match.flagA,
            }}
          />
        </div>
      </div>
      <div
        style={{
          alignSelf: "flex-end",
          backgroundColor: "#FFD700",
          color: "#0A0E27",
          padding: "6px 16px",
          borderRadius: 6,
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 32,
          letterSpacing: 2,
          opacity: stampOpacity,
          transform: `scale(${stampScale}) rotate(-6deg)`,
        }}
      >
        YOUR PICK {match.pick}
      </div>
    </div>
  );
};

export const ScenePredict: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 160 },
  });
  const headY = interpolate(headSpring, [0, 1], [-40, 0]);
  const headOpacity = interpolate(headSpring, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #0A0E27 0%, #0E1638 60%, #0A0E27 100%)",
      }}
    >
      {/* subtle pitch lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(90deg, rgba(0,210,106,0.04) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 140,
          opacity: headOpacity,
          transform: `translateY(${headY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 22,
            letterSpacing: 6,
            color: "#00D26A",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Step 01
        </div>
        <div
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: 160,
            color: "#fff",
            lineHeight: 0.9,
            letterSpacing: -2,
            marginTop: 4,
          }}
        >
          PREDICT <span style={{ color: "#FFD700" }}>EVERY MATCH</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 460,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 48,
          padding: "0 100px",
        }}
      >
        {MATCHES.map((m, i) => (
          <FixtureCard key={m.home} index={i} match={m} />
        ))}
      </div>
    </AbsoluteFill>
  );
};