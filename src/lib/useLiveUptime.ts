import { useEffect, useState } from 'react';
import { computeElapsedSeconds } from '../api/telemetry';

/**
 * 实时计算进程已运行秒数：1 分钟内按秒跳动，之后每 10 秒刷新一次，
 * 避免新启动时显示静止，同时在长运行实例上保持极低重渲染开销。
 */
export function useLiveUptime(startedAt?: string, fallbackSeconds?: number): number | null {
  const [seconds, setSeconds] = useState<number | null>(() => computeElapsedSeconds(startedAt, fallbackSeconds));

  useEffect(() => {
    const update = (): number | null => {
      const next = computeElapsedSeconds(startedAt, fallbackSeconds);
      setSeconds(next);
      return next;
    };

    const current = update();
    if (!startedAt || current === null) {
      return undefined;
    }

    const intervalMs = current < 60 ? 1000 : 10_000;
    const timer = window.setInterval(() => {
      update();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [startedAt, fallbackSeconds, seconds !== null && seconds < 60]);

  return seconds;
}
