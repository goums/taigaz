// Cherry-blossom petal confetti — ported from the design mockup, wrapped so it
// binds to a canvas element and exposes burst/celebrate helpers.

interface Petal {
  x: number; y: number; r: number; color: string; emoji: string | null;
  vx: number; vy: number; rot: number; vr: number; sway: number; life: number; burst: boolean;
}

export interface PetalController {
  burst: (n: number) => void;
  celebrate: () => void;
  celebrateGolden: () => void;
  destroy: () => void;
}

const COLORS = ["#eab8b9", "#d1b3e6", "#d1e7d7", "#d98a97", "#a978cf", "#f6e2e3"];

export function initPetals(canvas: HTMLCanvasElement): PetalController {
  const ctx = canvas.getContext("2d")!;
  let petals: Petal[] = [];
  let raf = 0;
  let running = false;
  // Lighter confetti on phones (fewer particles to draw per frame).
  const M = () => (window.innerWidth < 640 ? 0.5 : 1);
  const N = (n: number) => Math.max(1, Math.round(n * M()));

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  const makePetal = (x: number, y: number, burst: boolean, emoji?: string): Petal => ({
    x, y,
    r: emoji ? 14 + Math.random() * 12 : 6 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    emoji: emoji || null,
    vx: (Math.random() - 0.5) * (burst ? 7 : 1.2),
    vy: burst ? -(3 + Math.random() * 6) : 1 + Math.random() * 2,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.2,
    sway: Math.random() * 2,
    life: 1,
    burst,
  });

  const burst = (n: number) => {
    for (let i = 0; i < N(n); i++) petals.push(makePetal(innerWidth / 2, innerHeight * 0.35, true));
    start();
  };
  const celebrate = () => {
    for (let i = 0; i < N(90); i++) petals.push(makePetal(innerWidth / 2, innerHeight * 0.4, true));
    start();
    let rained = 0;
    const rain = setInterval(() => {
      for (let i = 0; i < N(4); i++) petals.push(makePetal(Math.random() * innerWidth, -20, false));
      start();
      if (++rained > 40) clearInterval(rain);
    }, 80);
  };
  const celebrateGolden = () => {
    const crowns = ["👑", "✨"];
    for (let i = 0; i < N(45); i++) petals.push(makePetal(innerWidth / 2, innerHeight * 0.4, true));
    for (let i = 0; i < N(8); i++) petals.push(makePetal(innerWidth / 2, innerHeight * 0.4, true, crowns[i % 2]));
    start();
    let n = 0;
    const rain = setInterval(() => {
      if (n % 2 === 0) petals.push(makePetal(Math.random() * innerWidth, -20, false, Math.random() < 0.5 ? "👑" : "✨"));
      for (let i = 0; i < N(2); i++) petals.push(makePetal(Math.random() * innerWidth, -20, false));
      start();
      if (++n > 24) clearInterval(rain);
    }, 90);
  };

  const drawPetal = (p: Petal) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    if (p.emoji) {
      ctx.font = p.r * 2 + "px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
      return;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.bezierCurveTo(p.r * 0.9, -p.r * 0.6, p.r * 0.6, p.r * 0.6, 0, p.r);
    ctx.bezierCurveTo(-p.r * 0.6, p.r * 0.6, -p.r * 0.9, -p.r * 0.6, 0, -p.r);
    ctx.fill();
    ctx.restore();
  };

  const loop = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    petals.forEach((p) => {
      p.vy += p.burst ? 0.16 : 0;
      p.x += p.vx + Math.sin((p.y + p.sway * 40) / 40) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.burst && p.vy > 0) p.life -= 0.006;
      drawPetal(p);
    });
    petals = petals.filter((p) => p.life > 0 && p.y < canvas.height + 30);
    // Idle when there's nothing to draw — no permanent rAF/clearRect churn.
    if (petals.length === 0) { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };

  return {
    burst,
    celebrate,
    celebrateGolden,
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
  };
}
