import { useEffect, useRef, type JSX } from 'react';

interface PulseRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
}

interface DotMatrix {
  count: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  baseX: Float32Array;
  baseY: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  radialDist: Float32Array;
  phase: Float32Array;
}

function buildMatrix(width: number, height: number): DotMatrix {
  const spacing = width < 640 ? 21 : 19;
  const cols = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / spacing) + 2;
  const count = cols * rows;

  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const ox = new Float32Array(count);
  const oy = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const radialDist = new Float32Array(count);
  const phase = new Float32Array(count);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const offsetX = (width - (cols - 1) * spacing) * 0.5;
  const offsetY = (height - (rows - 1) * spacing) * 0.5;
  const maxDist = Math.max(1, Math.hypot(cx, cy));

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = offsetY + row * spacing;
    for (let col = 0; col < cols; col += 1) {
      const x = offsetX + col * spacing;
      baseX[index] = x;
      baseY[index] = y;
      radialDist[index] = Math.hypot(x - cx, y - cy) / maxDist;
      phase[index] = Math.sin(col * 0.28 + row * 0.2) * Math.PI;
      index += 1;
    }
  }

  return { count, width, height, cx, cy, baseX, baseY, ox, oy, vx, vy, radialDist, phase };
}

/**
 * Alona 清透正交点阵波场：
 * - 正交规则点阵（TypedArray 零 GC），遵循 Alona 藏青（#1F2A44）→ 冰青（#22B8CF）色阶；
 * - 双谐波轻盈等高波浪扫过，波峰呈现清透冰青圆点与极细十字星点；
 * - 鼠标经过触发柔和弹性拨开与冰青点亮，点击释放清澈水波纹脉冲环。
 */
export function NetworkBackground({ className }: { className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: -9999, y: -9999, active: false };
    const pulses: PulseRing[] = [];

    let matrix = buildMatrix(1, 1);
    let isDark = false;
    let colorBase = '#94A6C0';
    let colorNavy = '#1F2A44';
    let colorCyan = '#22B8CF';
    let colorIce = '#18A7BE';
    let frame = 0;
    let startAt = 0;

    const readColors = (): void => {
      const root = document.documentElement;
      isDark = root.dataset.theme === 'dark';
      const style = getComputedStyle(root);
      colorBase = isDark ? '#4E6385' : '#96A7BF';
      colorNavy = isDark ? '#7C9AD4' : '#1F2A44';
      colorIce = style.getPropertyValue('--color-accent').trim() || (isDark ? '#22B8CF' : '#18A7BE');
      colorCyan = style.getPropertyValue('--color-cyan').trim() || (isDark ? '#38D2E8' : '#22B8CF');
    };

    const renderFrame = (elapsedSec: number, animatePhysics: boolean): void => {
      const { count, width, height, baseX, baseY, ox, oy, vx, vy, radialDist, phase } = matrix;
      ctx.clearRect(0, 0, width, height);

      if (animatePhysics) {
        for (let i = pulses.length - 1; i >= 0; i -= 1) {
          pulses[i].radius += 6.2;
          if (pulses[i].radius >= pulses[i].maxRadius) pulses.splice(i, 1);
        }
      }

      const revealProgress = animatePhysics ? Math.min(1.35, elapsedSec * 1.2) : 1.35;
      const t = elapsedSec;
      const pointerRadius = 168;
      const springK = 0.09;
      const damping = 0.81;

      const bucketBase: number[] = [];
      const bucketNavy: number[] = [];
      const bucketIce: number[] = [];
      const bucketCyan: number[] = [];
      const bucketSpark: number[] = [];

      for (let i = 0; i < count; i += 1) {
        const reveal = revealProgress - radialDist[i] * 0.85;
        if (reveal <= 0) continue;

        const bx = baseX[i];
        const by = baseY[i];

        let pointerEnergy = 0;
        if (animatePhysics) {
          if (pointer.active) {
            const dx = bx - pointer.x;
            const dy = by - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > 0.25 && d2 < pointerRadius * pointerRadius) {
              const dist = Math.sqrt(d2);
              const factor = 1 - dist / pointerRadius;
              pointerEnergy = factor * factor;
              const push = pointerEnergy * 2.05;
              vx[i] += (dx / dist) * push;
              vy[i] += (dy / dist) * push;
            }
          }

          for (let p = 0; p < pulses.length; p += 1) {
            const pulse = pulses[p];
            const dx = bx - pulse.x;
            const dy = by - pulse.y;
            const dist = Math.hypot(dx, dy);
            const delta = Math.abs(dist - pulse.radius);
            if (dist > 1 && delta < 30) {
              const ring = (1 - delta / 30) * (1 - pulse.radius / pulse.maxRadius);
              pointerEnergy = Math.max(pointerEnergy, ring * 1.0);
              vx[i] += (dx / dist) * ring * 2.2;
              vy[i] += (dy / dist) * ring * 2.2;
            }
          }

          vx[i] = (vx[i] - ox[i] * springK) * damping;
          vy[i] = (vy[i] - oy[i] * springK) * damping;
          ox[i] += vx[i];
          oy[i] += vy[i];
        }

        const x = bx + ox[i];
        const y = by + oy[i];

        const waveA = Math.sin(bx * 0.0072 - t * 0.92 + by * 0.0042);
        const waveB = Math.cos(by * 0.0086 + t * 0.65 - bx * 0.0032);
        const waveC = Math.sin(radialDist[i] * 6.4 - t * 1.15 + phase[i] * 0.18);
        const field = (waveA * 0.45 + waveB * 0.35 + waveC * 0.2 + 1) * 0.5;
        const energy = Math.min(1, field * Math.min(1, reveal * 2.3) + pointerEnergy * 0.7);

        if (energy < 0.5) {
          bucketBase.push(x, y, 1.05);
        } else if (energy < 0.72) {
          bucketNavy.push(x, y, 1.38 + (energy - 0.5) * 2.2);
        } else if (energy < 0.86) {
          bucketIce.push(x, y, 1.82 + (energy - 0.72) * 3.0);
        } else {
          const r = 2.25 + Math.min(1.0, (energy - 0.86) * 6.2);
          bucketCyan.push(x, y, r);
          if (energy > 0.92) {
            bucketSpark.push(x, y, r + 2.2);
          }
        }
      }

      const paintCircles = (buf: number[], color: string, alpha: number): void => {
        if (buf.length === 0) return;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i < buf.length; i += 3) {
          const x = buf[i];
          const y = buf[i + 1];
          const r = buf[i + 2];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      };

      paintCircles(bucketBase, colorBase, isDark ? 0.22 : 0.26);
      paintCircles(bucketNavy, colorNavy, isDark ? 0.34 : 0.32);
      paintCircles(bucketIce, colorIce, isDark ? 0.65 : 0.6);
      paintCircles(bucketCyan, colorCyan, isDark ? 0.88 : 0.84);

      if (bucketSpark.length > 0) {
        ctx.strokeStyle = colorCyan;
        ctx.globalAlpha = isDark ? 0.45 : 0.4;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < bucketSpark.length; i += 3) {
          const x = bucketSpark[i];
          const y = bucketSpark[i + 1];
          const arm = bucketSpark[i + 2];
          ctx.moveTo(x - arm, y);
          ctx.lineTo(x + arm, y);
          ctx.moveTo(x, y - arm);
          ctx.lineTo(x, y + arm);
        }
        ctx.stroke();
      }

      if (pointer.active) {
        const lens = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, pointerRadius);
        lens.addColorStop(0, isDark ? 'rgba(56, 210, 232, 0.12)' : 'rgba(34, 184, 207, 0.09)');
        lens.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = lens;
        ctx.fillRect(pointer.x - pointerRadius, pointer.y - pointerRadius, pointerRadius * 2, pointerRadius * 2);
      }

      ctx.globalAlpha = 1;
    };

    const tick = (now: number): void => {
      if (startAt === 0) startAt = now;
      renderFrame((now - startAt) * 0.001, true);
      frame = requestAnimationFrame(tick);
    };

    const stop = (): void => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = (): void => {
      stop();
      if (reduce.matches || document.hidden) {
        renderFrame(3.4, false);
      } else {
        frame = requestAnimationFrame(tick);
      }
    };

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      readColors();
      matrix = buildMatrix(width, height);
      startAt = 0;
      start();
    };

    const onPointerMove = (event: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };

    const onPointerLeave = (): void => {
      pointer.active = false;
    };

    const onPointerDown = (event: MouseEvent): void => {
      if (reduce.matches) return;
      const rect = canvas.getBoundingClientRect();
      pulses.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        radius: 8,
        maxRadius: Math.min(440, Math.max(matrix.width, matrix.height) * 0.44),
      });
      if (pulses.length > 4) pulses.shift();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      readColors();
      if (reduce.matches || document.hidden) renderFrame(3.4, false);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseleave', onPointerLeave);
    window.addEventListener('mousedown', onPointerDown);
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);

    return () => {
      stop();
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseleave', onPointerLeave);
      window.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
