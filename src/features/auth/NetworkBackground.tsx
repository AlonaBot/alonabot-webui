import { useEffect, useRef, type JSX } from 'react';

type Node = { x: number; y: number; vx: number; vy: number; r: number };

/** 固定种子的伪随机数，让每次打开的初始布局一致。 */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const linkDistance = 170;
const areaPerNode = 15_000;

/**
 * 登录页背景：缓慢漂移的节点，距离足够近时连线。颜色取 canvas 的 CSS color（强调色），随主题切换；
 * 减少动效时只画静止的一帧，页面隐藏时暂停。
 */
export function NetworkBackground({ className }: { className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let color = '';
    let frame = 0;

    const seed = () => {
      const random = seeded(7);
      nodes.length = 0;
      const count = Math.max(24, Math.round((width * height) / areaPerNode));
      for (let i = 0; i < count; i++) {
        nodes.push({ x: random() * width, y: random() * height, vx: (random() - 0.5) * 0.22, vy: (random() - 0.5) * 0.22, r: random() < 0.2 ? 3.5 + random() * 3 : 1.4 });
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 0.8;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance > linkDistance) continue;
          context.globalAlpha = (1 - distance / linkDistance) * 0.7;
          context.beginPath();
          context.moveTo(nodes[i].x, nodes[i].y);
          context.lineTo(nodes[j].x, nodes[j].y);
          context.stroke();
        }
      }
      for (const node of nodes) {
        context.globalAlpha = node.r > 2 ? 0.8 : 0.55;
        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fill();
      }
    };

    const step = () => {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20 || node.x > width + 20) node.vx *= -1;
        if (node.y < -20 || node.y > height + 20) node.vy *= -1;
      }
      draw();
      frame = requestAnimationFrame(step);
    };

    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const start = () => {
      stop();
      if (reduce.matches || document.hidden) draw();
      else frame = requestAnimationFrame(step);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      color = getComputedStyle(canvas).color;
      seed();
      start();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // 主题切换只换颜色，不重排节点。
    const theme = new MutationObserver(() => { color = getComputedStyle(canvas).color; draw(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener('change', start);
    return () => {
      stop();
      observer.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
