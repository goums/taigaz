import { useMemo } from "react";

// Fixed full-page scene (aurora blobs + sparkles) and falling petals/leaves,
// ported from the design mockup.
export default function Background() {
  const flakes = useMemo(() => {
    return Array.from({ length: 46 }, () => {
      const leaf = Math.random() < 0.16;
      const dur = 9 + Math.random() * 9;
      return {
        leaf,
        left: Math.random() * 100,
        dur,
        delay: -Math.random() * dur,
        drift: (Math.random() * 120 - 60).toFixed(0),
        s: (0.7 + Math.random() * 0.9).toFixed(2),
      };
    });
  }, []);

  return (
    <div className="page-scene" aria-hidden="true">
      <svg className="page-svg" viewBox="0 0 1000 1500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="sceneBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="85" />
          </filter>
        </defs>
        <g filter="url(#sceneBlur)">
          <ellipse cx="500" cy="150" rx="520" ry="260" fill="#7bedc0" opacity="0.32" />
          <ellipse cx="200" cy="120" rx="320" ry="220" fill="#49c9c0" opacity="0.24" />
          <ellipse cx="820" cy="240" rx="360" ry="240" fill="#a6e79a" opacity="0.20" />
          <ellipse cx="640" cy="520" rx="440" ry="260" fill="#5fd6a8" opacity="0.20" />
          <ellipse cx="180" cy="600" rx="340" ry="220" fill="#4fb894" opacity="0.18" />
          <ellipse cx="800" cy="780" rx="380" ry="240" fill="#7bedc0" opacity="0.16" />
          <ellipse cx="360" cy="920" rx="420" ry="250" fill="#49c9c0" opacity="0.16" />
          <ellipse cx="720" cy="1120" rx="420" ry="250" fill="#a6e79a" opacity="0.14" />
          <ellipse cx="260" cy="1260" rx="380" ry="230" fill="#5fd6a8" opacity="0.16" />
          <ellipse cx="640" cy="1420" rx="440" ry="260" fill="#7bedc0" opacity="0.14" />
        </g>
        <g className="sparks" fill="#eafff6">
          <circle cx="160" cy="90" r="2.5" /><circle cx="470" cy="230" r="2" /><circle cx="720" cy="70" r="2.5" />
          <circle cx="900" cy="220" r="2" /><circle cx="300" cy="360" r="2.5" /><circle cx="620" cy="420" r="2" />
          <circle cx="850" cy="560" r="2.5" /><circle cx="180" cy="640" r="2" /><circle cx="520" cy="720" r="2" />
          <circle cx="760" cy="880" r="2.5" /><circle cx="330" cy="980" r="2" /><circle cx="880" cy="1080" r="2" />
          <circle cx="220" cy="1180" r="2.5" /><circle cx="600" cy="1260" r="2" /><circle cx="810" cy="1360" r="2.5" />
          <circle cx="400" cy="1440" r="2" />
        </g>
      </svg>
      <div className="hero-flakes">
        {flakes.map((f, i) => (
          <span
            key={i}
            className={"flake " + (f.leaf ? "leaf" : "petal")}
            style={{
              left: f.left + "%",
              animationDuration: f.dur + "s",
              animationDelay: f.delay + "s",
              ["--drift" as string]: f.drift + "px",
              ["--s" as string]: f.s,
            }}
          />
        ))}
      </div>
    </div>
  );
}
