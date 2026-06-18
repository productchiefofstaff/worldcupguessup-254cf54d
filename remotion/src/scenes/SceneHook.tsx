import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame: frame - 4,
    fps,
    config: { damping: 18, stiffness: 140 },
  });
  const titleY = interpolate(titleSpring, [0, 1], [80, 0]);
  const titleBlur = interpolate(titleSpring, [0, 1], [20, 0]);

  const subSpring = spring({
    frame: frame - 18,
    fps,
    config: { damping: 20, stiffness: 160 },
  });
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);
  const subX = interpolate(subSpring, [0, 1], [-40, 0]);

  const flashOpacity = interpolate(frame, [0, 5, 10], [0.9, 0.2, 0], {
    extrapolateRight: "clamp",
  });

  const radarRotate = interpolate(frame, [0, 60], [0, 30]);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 30% 40%, #18204A 0%, #0A0E27 60%)",
      }}
    >
      {/* radial sweep accent */}
      <AbsoluteFill
        style={{
          transform: `rotate(${radarRotate}deg)`,
          transformOrigin: "30% 50%",
          background:
            "conic-gradient(from 0deg at 30% 50%, transparent 0deg, rgba(255,215,0,0.08) 25deg, transparent 50deg)",
        }}
      />
      {/* gold accent bar */}
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 380,
          width: 12,
          height: interpolate(titleSpring, [0, 1], [0, 320]),
          backgroundColor: "#FFD700",
        }}
      />
      {/* title */}
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 360,
          color: "#FFFFFF",
          fontFamily: "Bebas Neue, sans-serif",
          fontSize: 280,
          lineHeight: 0.85,
          letterSpacing: -4,
          transform: `translateY(${titleY}px)`,
          filter: `blur(${titleBlur}px)`,
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
        }}
      >
        THE<br />
        <span style={{ color: "#FFD700" }}>WORLD CUP</span>
      </div>
      {/* subtitle */}
      <div
        style={{
          position: "absolute",
          left: 215,
          top: 920,
          color: "rgba(255,255,255,0.65)",
          fontFamily: "Inter, sans-serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: 8,
          textTransform: "uppercase",
          opacity: subOpacity,
          transform: `translateX(${subX}px)`,
        }}
      >
        It's about to kick off
      </div>
      {/* opening flash */}
      <AbsoluteFill
        style={{
          backgroundColor: "#FFD700",
          opacity: flashOpacity,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};