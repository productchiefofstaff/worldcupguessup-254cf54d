import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

const PLAYERS = [
  { name: "JAMIE", points: 248, color: "#FFD700" },
  { name: "ALEX", points: 231, color: "#C0C0C0" },
  { name: "SAM", points: 214, color: "#CD7F32" },
  { name: "CHRIS", points: 198, color: "#3A4373" },
  { name: "JORDAN", points: 187, color: "#3A4373" },
];

const Row: React.FC<{ index: number; player: (typeof PLAYERS)[number] }> = ({
  index,
  player,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 18 + index * 6;
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 180 },
  });
  const x = interpolate(s, [0, 1], [120, 0]);
  const opacity = interpolate(s, [0, 1], [0, 1]);

  // counting points
  const countS = spring({
    frame: frame - (delay + 8),
    fps,
    config: { damping: 30, stiffness: 80 },
  });
  const pts = Math.round(interpolate(countS, [0, 1], [0, player.points]));

  const isFirst = index === 0;

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        display: "flex",
        alignItems: "center",
        gap: 28,
        padding: "20px 32px",
        backgroundColor: isFirst ? "rgba(255,215,0,0.12)" : "rgba(255,255,255,0.04)",
        border: isFirst
          ? "2px solid #FFD700"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        marginBottom: 14,
        width: 760,
      }}
    >
      <div
        style={{
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 64,
          color: player.color,
          width: 70,
          lineHeight: 1,
        }}
      >
        {index + 1}
      </div>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: player.color,
          opacity: 0.85,
        }}
      />
      <div
        style={{
          flex: 1,
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 48,
          color: "#fff",
          letterSpacing: 2,
        }}
      >
        {player.name}
      </div>
      <div
        style={{
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 54,
          color: isFirst ? "#FFD700" : "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pts}
        <span
          style={{
            fontSize: 20,
            marginLeft: 8,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "Inter, sans-serif",
            letterSpacing: 2,
          }}
        >
          PTS
        </span>
      </div>
    </div>
  );
};

export const SceneLeaderboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 160 },
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 80% 30%, #1B2455 0%, #0A0E27 70%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 140,
          opacity: interpolate(headSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(headSpring, [0, 1], [-30, 0])}px)`,
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
          Step 02
        </div>
        <div
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: 140,
            color: "#fff",
            lineHeight: 0.9,
            letterSpacing: -2,
            marginTop: 4,
          }}
        >
          BEAT <span style={{ color: "#FFD700" }}>YOUR MATES</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 430,
          right: 140,
        }}
      >
        {PLAYERS.map((p, i) => (
          <Row key={p.name} index={i} player={p} />
        ))}
      </div>
    </AbsoluteFill>
  );
};