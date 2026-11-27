import { useEffect, useState, type JSX } from 'react';
import { useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '../lib/cn';

export interface AnimatedNumberProps {
  readonly value: number;
  readonly format?: (value: number) => string;
  readonly className?: string;
}

const defaultFormat = (value: number): string => Math.round(value).toLocaleString();

/** AnimatedNumber 用弹簧物理平滑滚动指标数值，减少动效时直出最终值。 */
export function AnimatedNumber({ value, format = defaultFormat, className }: AnimatedNumberProps): JSX.Element {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 180, damping: 26, mass: 0.7 });
  const [display, setDisplay] = useState<string>(() => format(value));

  useEffect(() => {
    if (reduced) {
      motionValue.jump(value);
      setDisplay(format(value));
      return;
    }
    motionValue.set(value);
  }, [value, reduced, motionValue, format]);

  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    return spring.on('change', latest => {
      setDisplay(format(latest));
    });
  }, [spring, format, reduced]);

  return <span className={cn('tabular-nums', className)}>{display}</span>;
}
