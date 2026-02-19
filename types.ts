
export interface Founder {
  id: string;
  name: string;
  color: string;
}

export enum AuctionStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED'
}

export interface BidLog {
  price: number;
  timestamp: Date;
  event: 'DROP' | 'START' | 'PAUSE' | 'WIN';
  details?: string;
}

export interface AuctionState {
  currentPrice: number;
  status: AuctionStatus;
  winner: Founder | null;
  history: BidLog[];
  nextDropTime: number; // timestamp
}

export type SyncEvent = 
  | { type: 'START'; startTime: number; startPrice: number }
  | { type: 'BID'; winnerId: string; price: number; timestamp: number }
  | { type: 'RESET' };
