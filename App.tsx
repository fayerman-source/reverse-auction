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
  const [toast, setToast] = useState<string | null>(null);

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

  const showError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    setToast(msg.replace(/^Error:\s*/i, ''));
    window.setTimeout(() => setToast(null), 3500);
  };

  const handleReset = async (remoteInitiated = false) => {
    if (isRemote && !remoteInitiated) {
      try {
        await syncService.sendEvent({ type: 'RESET' });
      } catch (err) {
        showError(err);
      }
      return;
    }
    resetToIdle();
  };

  const handleRemoteEvent = (event: SyncEvent) => {
    switch (event.type) {
      case 'START':
        soundService.playDrop();
        if (event.participants && event.participants.length > 0) {
          setFounders(buildParticipants(event.participantCount ?? event.participants.length, event.participants));
        }
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
        setGameState((prev) => {
          const last = prev.history[prev.history.length - 1];
          const baseHistory =
            last && last.event === 'DROP' && last.price === event.price
              ? prev.history.slice(0, -1)
              : prev.history;

          return {
            ...prev,
            status: AuctionStatus.ENDED,
            winner,
            currentPrice: event.price,
            history: [...baseHistory, { price: event.price, timestamp: new Date(event.timestamp), event: 'WIN', details: winner?.name }],
          };
        });
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
        await syncService.sendEvent({
          type: 'START',
          startTime,
          startPrice: config.startPrice,
          participantCount: founders.length,
          participants: founders.map((f) => ({ id: f.id, name: f.name, color: f.color })),
        });
      } catch (err) {
        showError(err);
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
    if (isRemote) {
      if (!isHost) {
        showError('Only host can start the auction.');
        return;
      }
      if (claimedIds.size < founders.length) {
        showError(`Waiting for participants: ${claimedIds.size}/${founders.length} joined.`);
        return;
      }
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
        showError(err);
      }
      return;
    }

    const lockedPrice = gameState.currentPrice;
    soundService.playBid();

    setGameState((prev) => {
      if (prev.status !== AuctionStatus.RUNNING) return prev;

      const last = prev.history[prev.history.length - 1];
      const baseHistory =
        last && last.event === 'DROP' && last.price === lockedPrice
          ? prev.history.slice(0, -1)
          : prev.history;

      return {
        ...prev,
        status: AuctionStatus.ENDED,
        winner: founder,
        currentPrice: lockedPrice,
        history: [...baseHistory, { price: lockedPrice, timestamp: new Date(), event: 'WIN', details: founder.name }],
      };
    });
  };

  useEffect(() => {
    syncService.onParticipantsChanged = isRemote && isConnected ? (claimed) => setClaimedIds(claimed) : null;
    return () => {
      syncService.onParticipantsChanged = null;
    };
  }, [isRemote, isConnected]);

  const applySetup = async () => {
    const nextConfig: AuctionConfig = {
      startPrice: Math.max(1, Math.floor(draftConfig.startPrice)),
      floorPrice: Math.max(1, Math.floor(draftConfig.floorPrice)),
      decrementAmount: Math.max(1, Math.floor(draftConfig.decrementAmount)),
      dropIntervalMs: Math.max(250, Math.floor(draftConfig.dropIntervalMs)),
      participantCount: Math.max(1, Math.floor(draftConfig.participantCount)),
    };

    if (nextConfig.floorPrice >= nextConfig.startPrice) {
      showError('Floor price must be less than start price.');
      return;
    }

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

    if (isRemote && isConnected && isHost) {
      try {
        await syncService.publishRoomConfig(nextFounders, nextFounders.length);
      } catch (err) {
        showError(err);
      }
    }

    setSetupOpen(false);
  };

  const requiredParticipants = founders.length;
  const allSlotsClaimed = claimedIds.size >= requiredParticipants;
  const canStart = gameState.status === AuctionStatus.IDLE && (!isRemote || (isRemote && isHost));
  const canReset =
    (gameState.status === AuctionStatus.IDLE && gameState.history.length > 0) ||
    gameState.status === AuctionStatus.ENDED;

  return (
    <div className="h-[100svh] md:h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none">
      <header className="flex-none p-3 md:p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-50">
        <div className="w-full flex justify-between items-center px-1 md:px-4">
          <div className="flex items-center gap-2 md:gap-3">
            <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-cyan-500'} animate-pulse-fast`} />
            <h1 className="text-xs md:text-xl font-bold tracking-tight text-white uppercase">
              DUTCH AUCTION {isRemote && <span className="text-cyan-400 font-mono ml-1 md:ml-2">REMOTE</span>}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button disabled={(isRemote && isConnected) || gameState.status === AuctionStatus.RUNNING || (isRemote && !isHost)} onClick={() => { setDraftConfig(config); setDraftInitials(founders.map((f) => f.name).join(', ')); setSetupOpen(true); }} className="text-[11px] md:text-xs uppercase font-bold text-slate-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Setup
            </button>
            {!isRemote ? (
              <button onClick={() => setIsRemote(true)} className="text-[11px] md:text-xs uppercase font-bold text-slate-400 hover:text-cyan-400 transition-colors">
                Go Remote
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {!isConnected ? (
                  <div className="flex gap-1">
                    <input type="text" placeholder="Room code" className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs w-28 md:w-32 outline-none focus:border-cyan-500" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
                    <button onClick={async () => {
                      if (!roomCode.trim()) {
                        showError('Please enter a room code.');
                        return;
                      }
                      try {
                        const roomInfo = await syncService.joinRoom(roomCode, handleRemoteEvent);
                        const amHost = syncService.isHost();
                        setIsConnected(true);
                        setIsHost(amHost);

                        if (!amHost && roomInfo.participants && roomInfo.participants.length > 0) {
                          setFounders(buildParticipants(roomInfo.participantCount ?? roomInfo.participants.length, roomInfo.participants));
                        }

                        if (amHost) {
                          await syncService.publishRoomConfig(founders, founders.length);
                        }

                        setClaimedIds(await syncService.listClaimedParticipants());
                      } catch (err) {
                        showError(err);
                      }
                    }} className="bg-cyan-600 px-2 py-1 rounded text-[10px] md:text-xs font-bold">JOIN</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] md:text-xs text-cyan-300 font-mono uppercase">Room: {roomCode}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(roomCode);
                          setToast('Room code copied.');
                          window.setTimeout(() => setToast(null), 1800);
                        } catch {
                          showError('Could not copy room code.');
                        }
                      }}
                      className="text-[11px] md:text-xs text-cyan-400 uppercase font-bold"
                    >
                      Copy
                    </button>
                    <button onClick={() => { syncService.leaveRoom(); setIsConnected(false); setIsHost(false); setClaimedIds(new Set()); setIsRemote(false); setMyFounderId(null); }} className="text-[11px] md:text-xs text-red-500 uppercase font-bold">Disconnect</button>
                  </div>
                )}
              </div>
            )}

            {canStart && (
              <button
                disabled={isRemote && !allSlotsClaimed}
                title={isRemote && !allSlotsClaimed ? `Waiting for participants: ${claimedIds.size}/${requiredParticipants}` : undefined}
                onClick={handleStart}
                className="px-3 py-1.5 md:px-6 md:py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition-colors text-[10px] md:text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                START
              </button>
            )}
            {canReset && (!isRemote || isHost) && (
              <button onClick={() => handleReset(false)} className="px-2 py-1.5 md:px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors text-[10px] disabled:opacity-40 disabled:cursor-not-allowed">RESET</button>
            )}
          </div>
        </div>
      </header>

      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[130] bg-rose-500/95 text-white text-sm px-4 py-2 rounded-lg shadow-xl border border-rose-300/30">
          {toast}
        </div>
      )}

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
              <button onClick={() => { void applySetup(); }} className="px-3 py-2 rounded bg-cyan-500 text-slate-900 font-bold">Apply & Reset</button>
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
            <p className="text-slate-500 text-[10px] md:text-sm mb-4 uppercase tracking-widest font-mono">Select your identity for this room</p>
            <button
              onClick={() => { syncService.leaveRoom(); setIsConnected(false); setIsHost(false); setClaimedIds(new Set()); setIsRemote(false); setMyFounderId(null); }}
              className="mb-4 text-[10px] text-slate-400 hover:text-white uppercase font-bold"
            >
              ← Back
            </button>
            <div className="grid grid-cols-1 gap-3">{founders.map((f) => {
              const alreadyClaimed = claimedIds.has(f.id);
              return <button key={f.id} disabled={alreadyClaimed} onClick={async () => {
                try {
                  const ok = await syncService.claimParticipant(f.id);
                  if (ok) {
                    setMyFounderId(f.id);
                    setClaimedIds(await syncService.listClaimedParticipants());
                  } else {
                    showError('This participant is already claimed. Choose another.');
                  }
                } catch (err) {
                  showError(err);
                }
              }} className={`p-3 md:p-4 rounded-xl border-2 border-slate-800 transition-all font-bold text-base md:text-lg ${f.color.replace('bg-', 'text-')} ${alreadyClaimed ? 'opacity-40 cursor-not-allowed' : 'hover:border-cyan-500'}`}>
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
            <h3 className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 md:mb-3">History</h3>
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 mask-linear scrollbar-hide">
              {gameState.history.slice().reverse().map((log, idx) => <div key={idx} className="flex-shrink-0 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs md:text-sm font-mono whitespace-nowrap"><span className={log.event === 'WIN' ? 'text-green-400' : 'text-slate-300'}>${log.price.toLocaleString()}</span><span className="mx-1 opacity-20">|</span><span className="opacity-75">{log.event === 'WIN' ? log.details : log.event}</span></div>)}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center min-h-0">
            <div className="w-full max-w-4xl flex flex-col items-center">
              <Ticker price={gameState.currentPrice} status={gameState.status} nextDropTime={gameState.nextDropTime} dropIntervalMs={config.dropIntervalMs} />
            </div>
          </div>
        </div>

        <div
          className="flex-none w-full md:w-72 lg:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/40 p-2.5 md:p-6 z-10 max-h-[42svh] md:max-h-none overflow-y-auto"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
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
