import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../lib/theme';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  pulse: number; pulseSpeed: number;
}

const BOOT = [
  { t: '◈  H O S T P A N E L  C O M M A N D  S Y S T E M', k: 'title' },
  { t: '', k: 'blank' },
  { t: '  SYS  > Kernel interface            [  OK  ]', k: 'ok' },
  { t: '  SYS  > Security modules            [  OK  ]', k: 'ok' },
  { t: '  NET  > Encrypted channel           [  OK  ]', k: 'ok' },
  { t: '  FS   > Virtual filesystems         [  OK  ]', k: 'ok' },
  { t: '  SVC  > Service daemons             [  OK  ]', k: 'ok' },
  { t: '  SEC  > Integrity verification      [  OK  ]', k: 'ok' },
  { t: '', k: 'blank' },
  { t: '  ▶  ALL SYSTEMS NOMINAL — ACCESS GRANTED', k: 'granted' },
];

export function PanelFX() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const psRef     = useRef<Particle[]>([]);
  const [booting,  setBooting]  = useState(() => theme.key === 'panel' && !sessionStorage.getItem('hp_boot'));
  const [lines,    setLines]    = useState<typeof BOOT>([]);
  const [fade,     setFade]     = useState(false);

  /* boot sequence */
  useEffect(() => {
    if (!booting) return;
    let i = 0;
    const delays = [0, 80, 200, 170, 190, 160, 200, 180, 100, 600];
    const next = () => {
      if (i >= BOOT.length) {
        setTimeout(() => {
          setFade(true);
          setTimeout(() => { setBooting(false); sessionStorage.setItem('hp_boot', '1'); }, 700);
        }, 300);
        return;
      }
      setLines(prev => [...prev, BOOT[i]]);
      i++;
      setTimeout(next, delays[i] ?? 160);
    };
    const t = setTimeout(next, 400);
    return () => clearTimeout(t);
  }, []);

  /* particle canvas */
  useEffect(() => {
    if (theme.key !== 'panel') return;
    const cv = canvasRef.current;
    if (!cv) return;

    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const N = Math.min(80, Math.floor((cv.width * cv.height) / 16000));
    psRef.current = Array.from({ length: N }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.6 + 0.4,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.01 + Math.random() * 0.02,
    }));

    const draw = () => {
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);

      const ps = psRef.current;
      const MAX = 180;

      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.pulse += p.pulseSpeed;
        if (p.x < 0 || p.x > cv.width)  p.vx *= -1;
        if (p.y < 0 || p.y > cv.height) p.vy *= -1;
      });

      /* connections */
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
          if (d < MAX) {
            const alpha = (1 - d / MAX) * 0.13;
            ctx.beginPath();
            ctx.moveTo(ps[i].x, ps[i].y);
            ctx.lineTo(ps[j].x, ps[j].y);
            ctx.strokeStyle = `rgba(0,212,180,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      /* nodes */
      ps.forEach(p => {
        const g = (Math.sin(p.pulse) + 1) / 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,212,180,${0.18 + g * 0.65})`;
        ctx.fill();
        if (g > 0.7) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,212,180,${(g - 0.7) * 0.04})`;
          ctx.fill();
        }
      });

      frameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize); };
  }, [theme.key]);

  if (theme.key !== 'panel') return null;

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
      <div className="panel-scan" />
      <div className="panel-crt" />

      {booting && (
        <div className="panel-boot" style={{ opacity: fade ? 0 : 1 }}>
          <div className="panel-boot-box">
            <div className="panel-boot-badge">HP</div>
            <div style={{ height: 1, background: 'rgba(0,212,180,0.3)', margin: '16px 0' }} />
            {lines.map((l, i) => (
              <div key={i} className={`pbl pbl-${l.k}`}>{l.t || ' '}</div>
            ))}
            {!fade && <span className="pbl-cursor" />}
          </div>
        </div>
      )}
    </>
  );
}
