
import React from 'react';
import { Founder, AuctionStatus } from '../types';

interface FounderButtonProps {
  founder: Founder;
  currentPrice: number;
  status: AuctionStatus;
  onBid: (founder: Founder) => void;
  disabled: boolean;
  isWinner: boolean;
  isMe?: boolean;
  isClaimed?: boolean;
}

export const FounderButton: React.FC<FounderButtonProps> = ({
  founder,
  currentPrice,
  status,
  onBid,
  disabled,
  isWinner,
  isMe,
  isClaimed = false,
}) => {
  const isRunning = status === AuctionStatus.RUNNING;
  const isEnded = status === AuctionStatus.ENDED;

  let buttonStyle = "bg-slate-800/40 border-slate-800 text-slate-500"; 
  
  if (isWinner) {
    buttonStyle = `${founder.color} text-white ring-2 ring-white/20 shadow-[0_0_15px_rgba(0,0,0,0.4)] z-10`;
  } else if (isRunning) {
    if (disabled && !isWinner) {
      buttonStyle = "bg-slate-900/10 border-slate-900 text-slate-700 opacity-30 grayscale";
    } else {
      buttonStyle = `bg-slate-800 border-slate-700 text-white hover:border-cyan-500 transition-all active:scale-95`;
    }
  } else if (isEnded && !isWinner) {
    buttonStyle = "bg-slate-900/50 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed";
  } else if (isClaimed) {
    buttonStyle = "bg-slate-800/70 border-emerald-500/60 text-slate-200";
  }

  return (
    <button
      onClick={() => onBid(founder)}
      disabled={disabled}
      className={`
        relative group flex flex-col items-center justify-center p-2.5 md:p-4 
        rounded-xl md:rounded-2xl border-2 w-full transition-all duration-200
        min-h-[124px] md:min-h-[140px]
        ${buttonStyle}
      `}
    >
      {isWinner && (
        <div className="absolute -top-1.5 md:-top-2.5 px-1.5 py-0.5 md:px-2 md:py-1 bg-white text-black text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg z-10">
          Winner
        </div>
      )}

      {isMe && !isWinner && (
        <div className="absolute -top-1.5 md:-top-2.5 px-1.5 py-0.5 md:px-2 md:py-1 bg-cyan-500 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg z-10 border border-white/10">
          YOU
        </div>
      )}

      {!isWinner && status === AuctionStatus.IDLE && isClaimed && !isMe && (
        <div className="absolute -top-1.5 md:-top-2.5 px-1.5 py-0.5 md:px-2 md:py-1 bg-emerald-500 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg z-10 border border-white/10">
          READY
        </div>
      )}
      
      {/* Initials Circle */}
      <div className={`
        w-11 h-11 md:w-16 md:h-16 rounded-full mb-1.5 md:mb-3 flex items-center justify-center border md:border-2 shadow-sm transition-transform duration-300
        ${isWinner ? 'bg-white text-slate-900 border-white scale-105 md:scale-110' : 
          disabled && !isWinner ? 'bg-slate-800 border-slate-700 text-slate-600' :
          `${founder.color} text-white border-white/5 group-hover:border-white/20`}
      `}>
        <span className="text-base md:text-xl font-bold tracking-wider">{founder.name}</span>
      </div>
      
      <div className={`font-bold display-font uppercase ${isWinner ? 'text-xs md:text-lg tracking-normal' : 'text-sm md:text-base tracking-tight'}`}>
        {isWinner ? 'ACCEPTED' : isEnded ? 'PASSED' : isRunning ? (disabled ? 'WAIT' : 'ACCEPT') : (isClaimed ? 'READY' : 'OPEN')}
      </div>

      {isRunning && !disabled && (
        <div className="mt-1 text-xs md:text-sm font-mono opacity-70">
          ${(currentPrice / 1000).toFixed(0)}k
        </div>
      )}
    </button>
  );
};
