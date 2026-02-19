import React, { useState, useEffect, useRef } from 'react';
import { AuctionStatus, AuctionState, Founder, SyncEvent } from './types';
import { START_PRICE, MIN_PRICE, DROP_INCREMENT, DROP_INTERVAL_MS, INITIAL_FOUNDERS } from './constants';
import { Ticker } from './components/Ticker';
import { FounderButton } from './components/FounderButton';
import { soundService } from './services/soundService';
import { syncService } from './services/syncService';

const App: React.FC = () => {
  const [founders] = useState<Founder[]>(INITIAL_FOUNDERS);

  const [gameState, setGameState] = useState<AuctionState>({
    currentPrice: START_PRICE,
    status: AuctionStatus.IDLE,
    winner: null,
    history: [],
    nextDropTime: 0,
  });

  const [isRemote, setIsRemote] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [myFounderId, setMyFounderId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const timerRef = useRef<number | null>(null);

  const handleReset = (remoteInitiated = false) => {
    if (isRemote && !remoteInitiated) {
      syncService.sendEvent({ type: 'RESET' });
    }
    setGameState({
      currentPrice: START_PRICE,
      status: AuctionStatus.IDLE,
      winner: null,
      history: [],
      nextDropTime: 0,
    });
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
          nextDropTime: event.startTime + DROP_INTERVAL_MS,
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
          history: [
            ...prev.history,
            { price: event.price, timestamp: new Date(event.timestamp), event: 'WIN', details: winner?.name },
          ],
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

          const newPrice = prev.currentPrice - DROP_INCREMENT;

          if (newPrice < MIN_PRICE) {
            soundService.playEnd();
            return {
              ...prev,
              status: AuctionStatus.ENDED,
              winner: null,
              history: [
                ...prev.history,
                { price: prev.currentPrice, timestamp: new Date(), event: 'PAUSE', details: 'Floor Reached' },
              ],
            };
          }

          soundService.playMoney();
          return {
            ...prev,
            currentPrice: newPrice,
            nextDropTime: Date.now() + DROP_INTERVAL_MS,
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
  }, [gameState.status, gameState.nextDropTime]);

  const handleStart = () => {
    const startTime = Date.now();
    if (isRemote) {
      syncService.sendEvent({ type: 'START', startTime, startPrice: START_PRICE });
    } else {
      soundService.playDrop();
      setGameState((prev) => ({
        ...prev,
        status: AuctionStatus.RUNNING,
        history: [...prev.history, { price: prev.currentPrice, timestamp: new Date(), event: 'START' }],
        nextDropTime: startTime + DROP_INTERVAL_MS,
      }));
    }
  };

  const handleBid = async (founder: Founder) => {
    if (gameState.status !== AuctionStatus.RUNNING) return;
    if (isRemote && founder.id !== myFounderId) return;

    if (isRemote) {
      syncService.sendEvent({
        type: 'BID',
        winnerId: founder.id,
        price: gameState.currentPrice,
        timestamp: Date.now(),
      });
      return;
    }

    soundService.playBid();
    const delay = Math.floor(Math.random() * 200) + 50;
    await new Promise((resolve) => setTimeout(resolve, delay));

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

  const toggleRemote = () => {
    if (isRemote) {
      syncService.leaveRoom();
      setIsConnected(false);
      setIsRemote(false);
      setMyFounderId(null);
    } else {
      setIsRemote(true);
    }
  };

  const joinRoom = () => {
    if (!roomCode) return;
    syncService.joinRoom(roomCode, handleRemoteEvent);
    setIsConnected(true);
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
            {!isRemote ? (
              <button onClick={toggleRemote} className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 hover:text-cyan-400 transition-colors">
                Go Remote
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {!isConnected ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Room"
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] w-16 md:w-24 outline-none focus:border-cyan-500"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                    />
                    <button onClick={joinRoom} className="bg-cyan-600 px-2 py-1 rounded text-[10px] font-bold">
                      JOIN
                    </button>
                  </div>
                ) : (
                  <button onClick={toggleRemote} className="text-[9px] md:text-[10px] text-red-500 uppercase font-bold">
                    Disconnect
                  </button>
                )}
              </div>
            )}

            {gameState.status === AuctionStatus.IDLE && (
              <button
                onClick={handleStart}
                className="px-3 py-1.5 md:px-6 md:py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg transition-colors text-[10px] md:text-sm shadow-lg shadow-cyan-500/20"
              >
                START
              </button>
            )}
            {gameState.status === AuctionStatus.IDLE && gameState.history.length > 0 && (
              <button
                onClick={() => handleReset(false)}
                className="px-2 py-1.5 md:px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors text-[10px]"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </header>

      {isRemote && isConnected && !myFounderId && (
        <div className="absolute inset-0 bg-slate-950/95 z-[100] flex items-center justify-center backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-lg md:text-xl font-bold mb-1 font-display text-white">WHO ARE YOU?</h2>
            <p className="text-slate-500 text-[10px] md:text-sm mb-6 uppercase tracking-widest font-mono">Select your identity for this room</p>
            <div className="grid grid-cols-1 gap-3">
              {founders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setMyFounderId(f.id)}
                  className={`p-3 md:p-4 rounded-xl border-2 border-slate-800 hover:border-cyan-500 transition-all font-bold text-base md:text-lg ${f.color.replace('bg-', 'text-')}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameState.status === AuctionStatus.ENDED && (
        <div className="absolute inset-0 bg-slate-950/90 z-[110] flex items-center justify-center backdrop-blur-xl p-4 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-3xl max-w-lg w-full text-center shadow-[0_0_50px_rgba(0,0,0,0.6)] border-t-slate-700/50">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl md:text-4xl shadow-inner">
                {gameState.winner ? '🏆' : '🛑'}
              </div>
            </div>

            <h2 className="text-2xl md:text-4xl font-bold mb-2 font-display text-white tracking-tight uppercase">
              {gameState.winner ? 'Auction Won' : 'Auction Ended'}
            </h2>

            <div className="my-8 space-y-2">
              <p className="text-slate-500 text-[10px] md:text-xs uppercase tracking-[0.3em] font-mono">
                {gameState.winner ? 'Final Price Accepted By' : 'Process Terminated At'}
              </p>
              {gameState.winner ? (
                <div className={`text-4xl md:text-6xl font-black ${gameState.winner.color.replace('bg-', 'text-')} tracking-tighter`}>
                  {gameState.winner.name}
                </div>
              ) : (
                <div className="text-3xl md:text-5xl font-black text-slate-300 tracking-tighter">FLOOR REACHED</div>
              )}
              <div className="text-2xl md:text-4xl font-bold text-white/90 tabular-nums mt-4">${gameState.currentPrice.toLocaleString()}</div>
            </div>

            <div className="pt-6 border-t border-slate-800 mt-8 flex flex-col gap-3">
              <button
                onClick={() => handleReset(false)}
                className="w-full py-4 bg-white hover:bg-slate-100 text-slate-950 font-black rounded-xl md:rounded-2xl transition-all active:scale-95 text-sm md:text-base uppercase tracking-widest shadow-xl"
              >
                Reset Auction
              </button>
              {isRemote && <p className="text-[10px] text-slate-500 font-mono italic">This will reset the room for everyone.</p>}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col p-3 md:p-6 relative min-w-0">
          <div className="flex-none mb-2 border-b border-slate-800 pb-2">
            <h3 className="text-[8px] md:text-xs font-bold text-slate-600 uppercase tracking-widest mb-1 md:mb-3">History</h3>
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 mask-linear scrollbar-hide">
              {gameState.history.slice().reverse().map((log, idx) => (
                <div key={idx} className="flex-shrink-0 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[9px] md:text-[10px] font-mono whitespace-nowrap">
                  <span className={log.event === 'WIN' ? 'text-green-400' : 'text-slate-400'}>${log.price.toLocaleString()}</span>
                  <span className="mx-1 opacity-20">|</span>
                  <span className="opacity-70">{log.event === 'WIN' ? log.details : log.event}</span>
                </div>
              ))}
              {gameState.history.length === 0 && <span className="text-[9px] md:text-[10px] text-slate-700 italic">Standby...</span>}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center min-h-0">
            <div className="w-full max-w-4xl flex flex-col items-center">
              <Ticker
                price={gameState.currentPrice}
                status={gameState.status}
                nextDropTime={gameState.nextDropTime}
                dropIntervalMs={DROP_INTERVAL_MS}
              />

              {gameState.status === AuctionStatus.IDLE && gameState.history.length === 0 && (
                <div className="text-center text-slate-600 text-[9px] md:text-sm mt-4 md:mt-8 flex flex-col items-center gap-1">
                  <span className="uppercase tracking-[0.2em] opacity-50">Awaiting Price Discovery</span>
                  {isRemote && isConnected && <span className="text-cyan-500/50 font-mono text-[9px]">ROOM: {roomCode}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-none w-full md:w-72 lg:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/40 p-3 md:p-6 z-10">
          <div className="grid gap-2 md:gap-4 h-full" style={{ gridTemplateColumns: `repeat(${Math.min(founders.length, 3)}, minmax(0, 1fr))` }}>
            {founders.map((founder) => (
              <FounderButton
                key={founder.id}
                founder={founder}
                currentPrice={gameState.currentPrice}
                status={gameState.status}
                onBid={handleBid}
                disabled={
                  (gameState.status !== AuctionStatus.RUNNING && gameState.winner?.id !== founder.id) ||
                  (isRemote && myFounderId !== null && founder.id !== myFounderId && gameState.winner?.id !== founder.id)
                }
                isWinner={gameState.winner?.id === founder.id}
                isMe={isRemote && founder.id === myFounderId}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
