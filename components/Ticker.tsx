import React, { useEffect, useState } from 'react';
import { AuctionStatus } from '../types';

interface TickerProps {
  price: number;
  status: AuctionStatus;
  nextDropTime: number;
  dropIntervalMs: number;
}

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatCadence = (ms: number) => {
  if (ms % 60000 === 0) {
    const minutes = ms / 60000;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const seconds = Math.round(ms / 1000);
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
};

export const Ticker: React.FC<TickerProps> = ({ price, status, nextDropTime, dropIntervalMs }) => {
  const [timeLeftMs, setTimeLeftMs] = useState(dropIntervalMs);

  useEffect(() => {
    let animFrame: number;

    const updateTimer = () => {
      if (status !== AuctionStatus.RUNNING) {
        setTimeLeftMs(dropIntervalMs);
        return;
      }

      setTimeLeftMs(Math.max(0, nextDropTime - Date.now()));
      animFrame = requestAnimationFrame(updateTimer);
    };

    const onVisible = () => {
      if (!document.hidden) {
        updateTimer();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    updateTimer();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      cancelAnimationFrame(animFrame);
    };
  }, [status, nextDropTime, dropIntervalMs]);

  return (
    <div className="flex flex-col items-center justify-center py-4 md:py-12 relative w-full overflow-hidden">
      <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-5 pointer-events-none">
        <span className="text-[6rem] md:text-[12rem] font-bold tracking-tighter text-white/5">
          ${price / 1000}k
        </span>
      </div>

      <div className="relative z-10 text-center">
        <h2 className="text-slate-300 text-xs md:text-sm uppercase tracking-[0.16em] mb-1 md:mb-2 font-semibold">Current Price</h2>
        <div className="text-6xl sm:text-7xl md:text-9xl font-bold text-white tracking-tighter tabular-nums display-font leading-none">
          ${price.toLocaleString()}
        </div>
      </div>

      <p className="mt-4 text-xs md:text-sm text-slate-300 font-mono">
        {status === AuctionStatus.RUNNING ? `Next drop in ${formatCountdown(timeLeftMs)}` : `Drops every ${formatCadence(dropIntervalMs)}`}
      </p>
    </div>
  );
};
