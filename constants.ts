import { Founder } from './types';

type RawSetup = {
  startPrice?: number;
  floorPrice?: number;
  decrementAmount?: number;
  dropIntervalMs?: number;
  participantCount?: number;
  participants?: Founder[];
};

declare global {
  interface Window {
    AUCTION_SETUP?: RawSetup;
  }
}

const FALLBACK_PARTICIPANTS: Founder[] = [
  { id: '1', name: 'EF', color: 'bg-rose-500' },
  { id: '2', name: 'EG', color: 'bg-indigo-500' },
  { id: '3', name: 'AG', color: 'bg-emerald-500' },
];

const DEFAULTS = {
  startPrice: 20000,
  floorPrice: 1000,
  decrementAmount: 1000,
  dropIntervalMs: 10000,
};

const COLORS = [
  'bg-rose-500',
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
];

const n = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

function sanitizeParticipants(raw: RawSetup, desiredCount: number): Founder[] {
  const provided = Array.isArray(raw.participants) ? raw.participants : [];

  const normalized = provided
    .map((item, idx) => {
      const id = String(item?.id ?? idx + 1);
      const name = String(item?.name ?? `P${idx + 1}`).slice(0, 10).toUpperCase();
      const color = String(item?.color ?? COLORS[idx % COLORS.length]);
      if (!id || !name) return null;
      return { id, name, color } as Founder;
    })
    .filter((x): x is Founder => Boolean(x));

  const target = Math.max(1, Math.floor(desiredCount));

  if (normalized.length >= target) {
    return normalized.slice(0, target);
  }

  const seed = normalized.length > 0 ? normalized : FALLBACK_PARTICIPANTS;
  const result: Founder[] = [...normalized];
  while (result.length < target) {
    const i = result.length;
    const source = seed[i % seed.length];
    result.push({
      id: String(i + 1),
      name: source?.name ? `${source.name}${i + 1}`.slice(0, 10) : `P${i + 1}`,
      color: COLORS[i % COLORS.length],
    });
  }

  return result;
}

const raw: RawSetup = window.AUCTION_SETUP ?? {};

export const START_PRICE = n(raw.startPrice, DEFAULTS.startPrice);
export const MIN_PRICE = n(raw.floorPrice, DEFAULTS.floorPrice);
export const DROP_INCREMENT = n(raw.decrementAmount, DEFAULTS.decrementAmount);
export const DROP_INTERVAL_MS = n(raw.dropIntervalMs, DEFAULTS.dropIntervalMs);

const participantCount = Math.max(
  1,
  Math.floor(
    Number.isFinite(Number(raw.participantCount))
      ? Number(raw.participantCount)
      : (Array.isArray(raw.participants) && raw.participants.length > 0 ? raw.participants.length : FALLBACK_PARTICIPANTS.length),
  ),
);

export const INITIAL_FOUNDERS = sanitizeParticipants(raw, participantCount);
