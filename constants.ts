import { Founder } from './types';

export const START_PRICE = 20000;
export const MIN_PRICE = 1000;
export const DROP_INCREMENT = 1000;
export const DROP_INTERVAL_MS = 10000; // 10 seconds per tick

export const INITIAL_FOUNDERS: Founder[] = [
  { 
    id: '1', 
    name: 'EF', 
    color: 'bg-rose-500'
  },
  { 
    id: '2', 
    name: 'EG', 
    color: 'bg-indigo-500'
  },
  { 
    id: '3', 
    name: 'AG', 
    color: 'bg-emerald-500'
  },
];