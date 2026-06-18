import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoS = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 130 },
  });
  const logoScale = interpolate(logoS, [0, 1], [0.7, 1]);
  const logoBlur = interpolate(logoS, [0, 1], [25, 0]);
  const logoOpacity = interpolate(logoS, [0, 1], [0, 1]);

  const lineS = spring({
    frame: frame - 18,
    fps,
    config: { damping: 30, stiffness: 120 },
  });
  const lineW = interpolate(lineS, [0, 1], [0, 600]);

  const ctaS = spring({
    frame: frame - 32,
    fps,
    config: { damping: 18 },
  });
  const ctaOpacity = interpolate(ctaS, [0, 1], [0, 1]);
  const ctaY = interpolate(ctaS, [0, 1], [30, 0]);

  const urlS = spring({
    frame: frame - 55,
    fps,
    config: { damping: 22 },
  });

  // subtle stadium light beams
  const beamRot = interpolate(frame, [0, 120], [0, 12]);

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(160deg, #0A0E27 0%, #131A45 100%)",
      }}
    >
      <AbsoluteFill
        style={{
          transform: `rotate(${beamRot}deg)`,
          transformOrigin: "center top",
          background:
            "conic-gradient(from 200deg at 50% 0%, transparent, rgba(255,215,0,0.06) 30deg, transparent 60deg, rgba(0,210,106,0.05) 90deg, transparent 120deg)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Bebas Neue, sans-serif",
            color: "#fff",
            fontSize: 260,
            lineHeight: 0.85,
            letterSpacing: -4,
            textAlign: "center",
            opacity: logoOpacity,
            filter: `blur(${logoBlur}px)`,
            transform: `scale(${logoScale})`,
          }}
        >
          WORLD CUP<br />
          <span style={{ color: "#FFD700" }}>GUESS UP</span>
        </div>

        <div
          style={{
            width: lineW,
            height: 3,
            backgroundColor: "#00D26A",
            marginTop: 40,
            marginBottom: 40,
          }}
        />

        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 32,
            color: "rgba(255,255,255,0.75)",
            letterSpacing: 6,
            textTransform: "uppercase",
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
          }}
        >
          Predict. Compete. Win.
        </div>

        <div
          style={{
            marginTop: 60,
            padding: "22px 60px",
            backgroundColor: "#FFD700",
            color: "#0A0E27",
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: 56,
            letterSpacing: 4,
            borderRadius: 8,
            opacity: interpolate(urlS, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(urlS, [0, 1], [20, 0])}px)`,
            boxShadow: "0 20px 60px rgba(255,215,0,0.3)",
          }}
        >
          PLAY FREE NOW
        </div>
      </div>
    </AbsoluteFill>
  );
};