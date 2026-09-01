import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveState {
  block: number;
  ticks: number;
  tvlDelta: number;
  feesDelta: number;
  ilDelta: number;
  distDelta: number;
  epTokens: number;
  paused: boolean;
}

const INITIAL: LiveState = {
  block: 51204118,
  ticks: 0,
  tvlDelta: 0,
  feesDelta: 0,
  ilDelta: 0,
  distDelta: 0,
  epTokens: 41280,
  paused: false,
};

/** Simulated block/settlement stream that drives the "live" figures. */
export function useLiveStream() {
  const [live, setLive] = useState<LiveState>(INITIAL);
  const pausedRef = useRef(false);
  pausedRef.current = live.paused;

  useEffect(() => {
    const tick = setInterval(() => {
      if (pausedRef.current) return;
      setLive((prev) => {
        const ticks = prev.ticks + 1;
        const baseTvl = 24600000 + prev.tvlDelta;
        const priceMove = (Math.random() - 0.485) * 0.00055;
        const maxSwing = 24600000 * 0.018;
        let tvlDelta = prev.tvlDelta + Math.round(baseTvl * priceMove);
        tvlDelta = Math.max(-maxSwing, Math.min(maxSwing, tvlDelta));
        return {
          ...prev,
          ticks,
          tvlDelta,
          epTokens: prev.epTokens + Math.round(6 + Math.random() * 7),
          feesDelta: ticks % 4 === 0 ? prev.feesDelta + Math.round(360 + Math.random() * 920) : prev.feesDelta,
          ilDelta: Math.random() < 0.16 ? prev.ilDelta + Math.round(20 + Math.random() * 130) : prev.ilDelta,
          distDelta: ticks % 6 === 0 ? prev.distDelta + Math.round(650 + Math.random() * 1850) : prev.distDelta,
        };
      });
    }, 5200);

    const blocks = setInterval(() => {
      if (pausedRef.current) return;
      setLive((prev) => ({ ...prev, block: prev.block + 1 }));
    }, 1000);

    return () => {
      clearInterval(tick);
      clearInterval(blocks);
    };
  }, []);

  const togglePaused = useCallback(() => setLive((prev) => ({ ...prev, paused: !prev.paused })), []);

  return { live, togglePaused };
}
