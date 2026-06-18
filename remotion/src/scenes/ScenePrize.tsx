import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export const ScenePrize: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelS = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 180 },
  });

  const coinS = spring({
    frame: frame - 10,
    fps,
    config: { damping: 10, stiffness: 110 },
  });
  const coinScale = interpolate(coinS, [0, 1], [0.2, 1]);
  const coinRot = interpolate(coinS, [0, 1], [-180, 0]);

  const amountS = spring({
    frame: frame - 22,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });
  const amount = Math.min(80, Math.round(interpolate(amountS, [0, 1], [0, 80])));

  const burstS = spring({
    frame: frame - 18,
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const burstScale = interpolate(burstS, [0, 1], [0.4, 1.4]);
  const burstOpacity = interpolate(burstS, [0, 0.5, 1], [0.7, 0.3, 0]);

  const sublineS = spring({
    frame: frame - 38,
    fps,
    config: { damping: 20 },
  });

  // pulsing glow
  const pulse = Math.sin(frame * 0.15) * 0.5 + 0.5;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #2A1F00 0%, #0A0E27 70%)",
      }}
    >
      {/* radial confetti */}
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const dist = interpolate(burstS, [0, 1], [80, 520]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960 + Math.cos(angle) * dist - 6,
              top: 540 + Math.sin(angle) * dist - 6,
              width: 12,
              height: 12,
              backgroundColor: i % 2 === 0 ? "#FFD700" : "#00D26A",
              opacity: interpolate(burstS, [0, 0.4, 1], [0, 1, 0]),
              transform: `rotate(${angle * 50}deg)`,
            }}
          />
        );
      })}

      {/* glow */}
      <div
        style={{
          position: "absolute",
          left: 960 - 400,
          top: 540 - 400,
          width: 800,
          height: 800,
          borderRadius: 400,
          background:
            "radial-gradient(circle, rgba(255,215,0,0.35), transparent 60%)",
          opacity: 0.4 + pulse * 0.4,
          filter: "blur(20px)",
        }}
      />

      {/* shockwave ring */}
      <div
        style={{
          position: "absolute",
          left: 960 - 200,
          top: 540 - 200,
          width: 400,
          height: 400,
          borderRadius: 200,
          border: "4px solid #FFD700",
          opacity: burstOpacity,
          transform: `scale(${burstScale})`,
        }}
      />

      {/* small top label */}
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(labelS, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(labelS, [0, 1], [-20, 0])}px)`,
          fontFamily: "Inter, sans-serif",
          fontSize: 24,
          color: "#00D26A",
          letterSpacing: 8,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Step 03 — First Place Wins
      </div>

      {/* coin / amount badge */}
      <div
        style={{
          position: "absolute",
          top: 340,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${coinScale}) rotate(${coinRot}deg)`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: 460,
            lineHeight: 0.9,
            color: "#FFD700",
            letterSpacing: -8,
            textShadow: "0 0 60px rgba(255,215,0,0.5)",
          }}
        >
          £{amount}
        </div>
      </div>

      {/* tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(sublineS, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(sublineS, [0, 1], [20, 0])}px)`,
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 90,
          color: "#fff",
          letterSpacing: 2,
        }}
      >
        WINNER TAKES ALL
      </div>
    </AbsoluteFill>
  );
};