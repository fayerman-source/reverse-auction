
import React, { useEffect, useState } from 'react';
import { AuctionStatus } from '../types';
import { DROP_INTERVAL_MS } from '../constants';

interface TickerProps {
  price: number;
  status: AuctionStatus;
  nextDropTime: number;
}

export const Ticker: React.FC<TickerProps> = ({ price, status, nextDropTime }) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    let animFrame: number;
    
    const updateProgress = () => {
      if (status !== AuctionStatus.RUNNING) {
        setProgress(100);
        return;
      }
      
      const now = Date.now();
      const timeLeft = Math.max(0, nextDropTime - now);
      const percentage = (timeLeft / DROP_INTERVAL_MS) * 100;
      setProgress(percentage);

      if (timeLeft > 0) {
        animFrame = requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    return () => cancelAnimationFrame(animFrame);
  }, [status, nextDropTime]);

  return (
    <div className="flex flex-col items-center justify-center py-4 md:py-12 relative w-full overflow-hidden">
      {/* Ghost price hidden on small mobile to save visual space */}
      <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-5 pointer-events-none">
        <span className="text-[6rem] md:text-[12rem] font-bold tracking-tighter text-white/5">
          ${price / 1000}k
        </span>
      </div>
      
      <div className="relative z-10 text-center">
        <h2 className="text-slate-500 text-[8px] md:text-sm uppercase tracking-[0.2em] mb-0.5 md:mb-2 font-medium">Current Price</h2>
        <div className="text-4xl sm:text-7xl md:text-9xl font-bold text-white tracking-tighter tabular-nums display-font leading-none">
          ${price.toLocaleString()}
        </div>
      </div>

      {/* Timer Bar */}
      <div className="w-32 md:w-64 h-1 md:h-2 bg-slate-800 rounded-full mt-3 md:mt-8 overflow-hidden relative">
        <div 
          className={`h-full absolute top-0 left-0 transition-all duration-75 ease-linear ${
            progress < 30 ? 'bg-red-500' : 'bg-cyan-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {status === AuctionStatus.RUNNING && (
        <p className="mt-1.5 text-[8px] md:text-xs text-slate-500 font-mono animate-pulse">
          {Math.ceil((progress / 100) * (DROP_INTERVAL_MS / 1000))}s
        </p>
      )}
    </div>
  );
};
