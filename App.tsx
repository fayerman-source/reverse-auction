import React, { useEffect, useRef, useState } from 'react';
import { AuctionConfig, AuctionState, AuctionStatus, Founder, SyncEvent } from './types';
import { INITIAL_CONFIG, INITIAL_FOUNDERS, buildParticipants } from './constants';
import { Ticker } from './components/Ticker';
import { FounderButton } from './components/FounderButton';
import { soundService } from './services/soundService';
import { syncService } from './services/syncService';

const App: React.FC = () => {
  const [config, setConfig] = useState<AuctionConfig>(INITIAL_CONFIG);
  const [draftConfig, setDraftConfig] = useState<AuctionConfig>(INITIAL_CONFIG);
  const [founders, setFounders] = useState<Founder[]>(INITIAL_FOUNDERS);
  const [draftInitials, setDraftInitials] = useState<string>(INITIAL_FOUNDERS.map((f) => f.name).join(', '));
  const [setupOpen, setSetupOpen] = useState(false);

  const [gameState, setGameState] = useState<AuctionState>({
    currentPrice: INITIAL_CONFIG.startPrice,
    status: AuctionStatus.IDLE,
    winner: null,
    history: [],
    nextDropTime: 0,
  });

  const [isRemote, setIsRemote] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [myFounderId, setMyFounderId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [showStartConsent, setShowStartConsent] = useState(false);

  const timerRef = useRef<number | null>(null);

  const resetToIdle = () => {
    setGameState({
      currentPrice: config.startPrice,
      status: AuctionStatus.IDLE,
      winner: null,
      history: [],
      nextDropTime: 0,
    });
  };

  const handleReset = async (remoteInitiated = false) => {
    if (isRemote && !remoteInitiated) {
      try {
        await syncService.sendEvent({ type: 'RESET' });
      } catch (err) {
        alert(String(err));
      }
      return;
    }
    resetToIdle();
  };

  const handleRemoteEvent = (event: SyncEvent) => {
    switch (event.type) {
      case 'START':
        soundService.playDrop();
        setGameState({
          currentPrice: event.startPrice,
          status: AuctionStatus.RUNNING,
          winner: null,
          history: [{ price: event.startPrice, timestamp: new Date(), event: 'START' }],
          nextDropTime: event.startTime + config.dropIntervalMs,
        });
        break;
      case 'BID': {
        const winner = founders.find((f) => f.id === event.winnerId) || null;
        soundService.playBid();
        setGameState((prev) => ({
          ...prev,
          status: AuctionStatus.ENDED,
          winner,
          currentPrice: event.price,
          history: [...prev.history, { price: event.price, timestamp: new Date(event.timestamp), event: 'WIN', details: winner?.name }],
        }));
        break;
      }
      case 'RESET':
        handleReset(true);
        break;
    }
  };

  useEffect(() => {
    if (gameState.status === AuctionStatus.RUNNING) {
      const delay = Math.max(0, gameState.nextDropTime - Date.now());

      timerRef.current = window.setTimeout(() => {
        setGameState((prev) => {
          if (prev.status !== AuctionStatus.RUNNING) return prev;
          const newPrice = prev.currentPrice - config.decrementAmount;

          if (newPrice < config.floorPrice) {
            soundService.playEnd();
            return {
              ...prev,
              status: AuctionStatus.ENDED,
              winner: null,
              history: [...prev.history, { price: prev.currentPrice, timestamp: new Date(), event: 'PAUSE', details: 'Floor Reached' }],
            };
          }

          soundService.playMoney();
          return {
            ...prev,
            currentPrice: newPrice,
            nextDropTime: Date.now() + config.dropIntervalMs,
            history: [...prev.history, { price: newPrice, timestamp: new Date(), event: 'DROP' }],
          };
        });
      }, delay);
    } else if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState.status, gameState.nextDropTime, config]);

  const executeStart = async () => {
    const startTime = Date.now();

    if (isRemote) {
      try {
        await syncService.sendEvent({ type: 'START', startTime, startPrice: config.startPrice });
      } catch (err) {
        alert(String(err));
      }
    } else {
      soundService.playDrop();
      setGameState((prev) => ({
        ...prev,
        currentPrice: config.startPrice,
        status: AuctionStatus.RUNNING,
        history: [...prev.history, { price: config.startPrice, timestamp: new Date(), event: 'START' }],
        nextDropTime: startTime + config.dropIntervalMs,
      }));
    }
  };

  const handleStart = async () => {
    if (isRemote && isHost) {
      setShowStartConsent(true);
      return;
    }
    await executeStart();
  };

  const handleBid = async (founder: Founder) => {
    if (gameState.status !== AuctionStatus.RUNNING) return;
    if (isRemote && founder.id !== myFounderId) return;

    if (isRemote) {
      try {
        await syncService.sendEvent({ type: 'BID', winnerId: founder.id, price: gameState.currentPrice, timestamp: Date.now() });
      } catch (err) {
        alert(String(err));
      }
      return;
    }

    soundService.playBid();
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 200) + 50));

    setGameState((prev) => {
      if (prev.status !== AuctionStatus.RUNNING) return prev;
      return {
        ...prev,
        status: AuctionStatus.ENDED,
        winner: founder,
        history: [...prev.history, { price: prev.currentPrice, timestamp: new Date(), event: 'WIN', details: founder.name }],
      };
    });
  };

  useEffect(() => {
    let timer: number | null = null;

    const refreshClaims = async () => {
      if (!isRemote || !isConnected) return;
      const claimed = await syncService.listClaimedParticipants();
      setClaimedIds(claimed);
    };

    void refreshClaims();
    if (isRemote && isConnected) {
      timer = window.setInterval(() => {
        void refreshClaims();
      }, 3000);
    }

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [isRemote, isConnected]);

  const applySetup = () => {
    const nextConfig: AuctionConfig = {
      startPrice: Math.max(1, Math.floor(draftConfig.startPrice)),
      floorPrice: Math.max(1, Math.floor(draftConfig.floorPrice)),
      decrementAmount: Math.max(1, Math.floor(draftConfig.decrementAmount)),
      dropIntervalMs: Math.max(250, Math.floor(draftConfig.dropIntervalMs)),
      participantCount: Math.max(1, Math.floor(draftConfig.participantCount)),
    };

    const parsedNames = draftInitials
      .split(',')
      .map((n) => n.trim().toUpperCase())
      .filter(Boolean)
      .map((name, idx) => ({ id: String(idx + 1), name, color: founders[idx]?.color ?? 'bg-cyan-500' }));

    const nextFounders = buildParticipants(nextConfig.participantCount, parsedNames.length > 0 ? parsedNames : founders);

    setConfig(nextConfig);
    setFounders(nextFounders);
    setMyFounderId(null);
    setGameState({
      currentPrice: nextConfig.startPrice,
      status: AuctionStatus.IDLE,
      winner: null,
      history: [],
      nextDropTime: 0,
    });
    setSetupOpen(false);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none">
      <header className="flex-none p-3 md:p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-50">
        <div className="w-full flex justify-between items-center px-1 md:px-4">
          <div className="flex items-center gap-2 md:gap-3">
            <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-cyan-500'} animate-pulse-fast`} />
            <h1 className="text-xs md:text-xl font-bold tracking-tight text-white uppercase">
              DUTCH AUCTION {isRemote && <span className="text-cyan-400 font-mono ml-1 md:ml-2">REMOTE</span>}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button disabled={isRemote && !isHost} onClick={() => { setDraftConfig(config); setDraftInitials(founders.map((f) => f.name).join(', ')); setSetupOpen(true); }} className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Setup
            </button>
            {!isRemote ? (
              <button onClick={() => setIsRemote(true)} className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 hover:text-cyan-400 transition-colors">
                Go Remote
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {!isConnected ? (
                  <div className="flex gap-1">
                    <input type="text" placeholder="Room" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] w-16 md:w-24 outline-none focus:border-cyan-500" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
                    <button onClick={async () => { if (!roomCode) return; await syncService.joinRoom(roomCode, handleRemoteEvent); setIsConnected(true); setIsHost(syncService.isHost()); setClaimedIds(await syncService.listClaimedParticipants()); }} className="bg-cyan-600 px-2 py-1 rounded text-[10px] font-bold">JOIN</button>
                  </div>
                ) : (
                  <button onClick={() => { syncService.leaveRoom(); setIsConnected(false); setIsHost(false); setClaimedIds(new Set()); setIsRemote(false); setMyFounderId(null); }} className="text-[9px] md:text-[10px] text-red-500 uppercase font-bold">Disconnect</button>
                )}
              </div>
            )}

            {gameState.status === AuctionStatus.IDLE && <button disabled={isRemote && !isHost} onClick={handleStart} className="px-3 py-1.5 md:px-6 md:py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition-colors text-[10px] md:text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed">START</button>}
            {gameState.status === AuctionStatus.IDLE && gameState.history.length > 0 && <button disabled={isRemote && !isHost} onClick={() => handleReset(false)} className="px-2 py-1.5 md:px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors text-[10px] disabled:opacity-40 disabled:cursor-not-allowed">RESET</button>}
          </div>
        </div>
      </header>

      {setupOpen && (
        <div className="absolute inset-0 bg-slate-950/90 z-[120] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Auction Setup</h2>
            <div className="space-y-3 text-sm">
              <label className="block">Start Price
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="number" value={draftConfig.startPrice} onChange={(e) => setDraftConfig({ ...draftConfig, startPrice: Number(e.target.value) })} />
              </label>
              <label className="block">Floor Price
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="number" value={draftConfig.floorPrice} onChange={(e) => setDraftConfig({ ...draftConfig, floorPrice: Number(e.target.value) })} />
              </label>
              <label className="block">Decrement Amount
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="number" value={draftConfig.decrementAmount} onChange={(e) => setDraftConfig({ ...draftConfig, decrementAmount: Number(e.target.value) })} />
              </label>
              <label className="block">Drop Interval (ms)
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="number" value={draftConfig.dropIntervalMs} onChange={(e) => setDraftConfig({ ...draftConfig, dropIntervalMs: Number(e.target.value) })} />
              </label>
              <label className="block">Participants
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="number" value={draftConfig.participantCount} onChange={(e) => setDraftConfig({ ...draftConfig, participantCount: Number(e.target.value) })} />
              </label>
              <label className="block">Participant Initials (comma-separated)
                <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1" type="text" placeholder="EF, EG, AG" value={draftInitials} onChange={(e) => setDraftInitials(e.target.value)} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setDraftConfig(config); setDraftInitials(founders.map((f) => f.name).join(', ')); setSetupOpen(false); }} className="px-3 py-2 rounded border border-slate-700">Cancel</button>
              <button onClick={applySetup} className="px-3 py-2 rounded bg-cyan-500 text-slate-900 font-bold">Apply & Reset</button>
            </div>
          </div>
        </div>
      )}

      {showStartConsent && (
        <div className="absolute inset-0 bg-slate-950/90 z-[121] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg md:text-xl font-bold mb-2">Confirm Start</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              By starting, participants acknowledge this is a live auction workflow. Legal enforceability may require separate signed terms.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowStartConsent(false)} className="px-3 py-2 rounded border border-slate-700">Cancel</button>
              <button
                onClick={async () => {
                  setShowStartConsent(false);
                  await executeStart();
                }}
                className="px-3 py-2 rounded bg-cyan-500 text-slate-900 font-bold"
              >
                Acknowledge & Start
              </button>
            </div>
          </div>
        </div>
      )}

      {isRemote && isConnected && !myFounderId && (
        <div className="absolute inset-0 bg-slate-950/95 z-[100] flex items-center justify-center backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-lg md:text-xl font-bold mb-1 font-display text-white">WHO ARE YOU?</h2>
            <p className="text-slate-500 text-[10px] md:text-sm mb-6 uppercase tracking-widest font-mono">Select your identity for this room</p>
            <div className="grid grid-cols-1 gap-3">{founders.map((f) => {
              const alreadyClaimed = claimedIds.has(f.id);
              return <button key={f.id} disabled={alreadyClaimed} onClick={async () => { const ok = await syncService.claimParticipant(f.id); if (ok) { setMyFounderId(f.id); setClaimedIds(await syncService.listClaimedParticipants()); } else { alert('This participant is already claimed. Choose another.'); } }} className={`p-3 md:p-4 rounded-xl border-2 border-slate-800 transition-all font-bold text-base md:text-lg ${f.color.replace('bg-', 'text-')} ${alreadyClaimed ? 'opacity-40 cursor-not-allowed' : 'hover:border-cyan-500'}`}>
                <div>{f.name}</div>
                <div className="text-[10px] mt-1 text-slate-400">{alreadyClaimed ? 'Already joined' : 'Available'}</div>
              </button>;
            })}</div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col p-3 md:p-6 relative min-w-0">
          <div className="flex-none mb-2 border-b border-slate-800 pb-2">
            <h3 className="text-[8px] md:text-xs font-bold text-slate-600 uppercase tracking-widest mb-1 md:mb-3">History</h3>
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 mask-linear scrollbar-hide">
              {gameState.history.slice().reverse().map((log, idx) => <div key={idx} className="flex-shrink-0 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[9px] md:text-[10px] font-mono whitespace-nowrap"><span className={log.event === 'WIN' ? 'text-green-400' : 'text-slate-400'}>${log.price.toLocaleString()}</span><span className="mx-1 opacity-20">|</span><span className="opacity-70">{log.event === 'WIN' ? log.details : log.event}</span></div>)}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center min-h-0">
            <div className="w-full max-w-4xl flex flex-col items-center">
              <Ticker price={gameState.currentPrice} status={gameState.status} nextDropTime={gameState.nextDropTime} dropIntervalMs={config.dropIntervalMs} />
            </div>
          </div>
        </div>

        <div className="flex-none w-full md:w-72 lg:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/40 p-2.5 md:p-6 z-10 max-h-[42vh] md:max-h-none overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 gap-2 md:gap-4 h-full">
            {founders.map((founder) => (
              <FounderButton key={founder.id} founder={founder} currentPrice={gameState.currentPrice} status={gameState.status} onBid={handleBid} disabled={(gameState.status !== AuctionStatus.RUNNING && gameState.winner?.id !== founder.id) || (isRemote && myFounderId !== null && founder.id !== myFounderId && gameState.winner?.id !== founder.id)} isWinner={gameState.winner?.id === founder.id} isMe={isRemote && founder.id === myFounderId} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
