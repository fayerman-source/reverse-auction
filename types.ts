export interface Founder {
  id: string;
  name: string;
  color: string;
}

export interface AuctionConfig {
  startPrice: number;
  floorPrice: number;
  decrementAmount: number;
  dropIntervalMs: number;
  participantCount: number;
}

export enum AuctionStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

export interface BidLog {
  price: number;
  timestamp: Date;
  event: 'DROP' | 'START' | 'NO_DEAL' | 'WIN';
  details?: string;
}

export interface AuctionState {
  currentPrice: number;
  status: AuctionStatus;
  winner: Founder | null;
  history: BidLog[];
  nextDropTime: number;
}

export type SyncParticipant = { id: string; name: string; color: string };

export type SyncEvent =
  | { type: 'START'; startTime: number; startPrice: number; participantCount?: number; participants?: SyncParticipant[] }
  | { type: 'BID'; winnerId: string; price: number; timestamp: number }
  | { type: 'NO_DEAL'; price: number; timestamp: number }
  | { type: 'RESET' };
