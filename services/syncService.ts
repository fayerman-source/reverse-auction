import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuctionStatus, Founder, SyncConfig, SyncEvent, SyncHistoryEntry, SyncParticipant, SyncSnapshot } from '../types';

const runtimeSetup = (window as any).AUCTION_SETUP ?? {};

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const setupUrl = (runtimeSetup.supabaseUrl as string | undefined)?.trim();
const setupAnon = (runtimeSetup.supabaseAnonKey as string | undefined)?.trim();

const url = envUrl || setupUrl;
const anon = envAnon || setupAnon;

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  if (!url || !anon) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  supabaseClient = createClient(url, anon);
  return supabaseClient;
}

type RoomState = {
  roomId: string;
  lastEvent?: SyncEvent;
  updatedAt: number;
  eventSeq: number;
  status: AuctionStatus;
  participants?: SyncParticipant[];
  participantCount?: number;
  snapshot?: SyncSnapshot;
};

type JoinRoomResult = {
  participants: SyncParticipant[] | null;
  participantCount: number | null;
  snapshot: SyncSnapshot | null;
};

type RoomMeta = {
  room_id: string;
  host_user_id: string;
};

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

class SyncService {
  private roomCode: string | null = null;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private currentUserId: string | null = null;
  private isHostForRoom = false;
  private lastSeenEventSeq = 0;
  onParticipantsChanged: ((claimed: Set<string>) => void) | null = null;
  onConnectionStatus: ((state: ConnectionState) => void) | null = null;
  onSnapshotChanged: ((snapshot: SyncSnapshot) => void) | null = null;

  async initAuth() {
    if (this.currentUserId) return this.currentUserId;
    const supabase = getSupabase();

    const existing = await supabase.auth.getUser();
    if (existing.data.user?.id) {
      this.currentUserId = existing.data.user.id;
      return this.currentUserId;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user?.id) {
      throw new Error(`auth failed: ${error?.message ?? 'unknown'}`);
    }
    this.currentUserId = data.user.id;
    return this.currentUserId;
  }

  isHost() {
    return this.isHostForRoom;
  }

  getLastSeenEventSeq() {
    return this.lastSeenEventSeq;
  }

  private async getOrCreateRoomMeta(roomId: string): Promise<RoomMeta> {
    const supabase = getSupabase();
    const userId = await this.initAuth();

    const existing = await supabase.from('rooms').select('room_id,host_user_id').eq('room_id', roomId).maybeSingle();
    if (existing.data) {
      this.isHostForRoom = existing.data.host_user_id === userId;
      return existing.data as RoomMeta;
    }

    const created = await supabase
      .from('rooms')
      .insert({ room_id: roomId, host_user_id: userId })
      .select('room_id,host_user_id')
      .single();

    if (created.error || !created.data) {
      const fallback = await supabase.from('rooms').select('room_id,host_user_id').eq('room_id', roomId).single();
      if (fallback.error || !fallback.data) {
        throw new Error(`room init failed: ${created.error?.message ?? fallback.error?.message ?? 'unknown'}`);
      }
      this.isHostForRoom = fallback.data.host_user_id === userId;
      return fallback.data as RoomMeta;
    }

    this.isHostForRoom = created.data.host_user_id === userId;
    return created.data as RoomMeta;
  }

  private async readRoomState(roomId: string): Promise<RoomState | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('auction_rooms').select('state').eq('room_id', roomId).maybeSingle();
    if (error || !data?.state) return null;
    return data.state as RoomState;
  }

  private async writeRoomState(roomId: string, nextState: RoomState) {
    const supabase = getSupabase();
    const { error } = await supabase.from('auction_rooms').upsert({ room_id: roomId, state: nextState }, { onConflict: 'room_id' });
    if (error) throw new Error(error.message);
  }

  private dispatchIfNewer(state: RoomState | null, onEvent: (event: SyncEvent) => void) {
    if (!state?.lastEvent) return;
    const seq = Number(state.eventSeq ?? 0);
    if (seq > this.lastSeenEventSeq) {
      this.lastSeenEventSeq = seq;
      onEvent(state.lastEvent);
    }
  }

  private emitSnapshot(snapshot: SyncSnapshot | null | undefined) {
    if (!snapshot) return;
    this.onSnapshotChanged?.(snapshot);
  }

  private buildBaseSnapshot(current: RoomState, fallbackConfig?: SyncConfig): SyncSnapshot {
    const config =
      current.snapshot?.config ??
      fallbackConfig ?? {
        startPrice: 20000,
        floorPrice: 1000,
        decrementAmount: 1000,
        dropIntervalMs: 10000,
      };

    const participants =
      current.snapshot?.participants ??
      current.participants ??
      [];

    const participantCount = current.snapshot?.participantCount ?? current.participantCount ?? participants.length;

    return {
      status: current.snapshot?.status ?? current.status,
      currentPrice: current.snapshot?.currentPrice ?? config.startPrice,
      nextDropTime: current.snapshot?.nextDropTime ?? 0,
      winnerId: current.snapshot?.winnerId ?? null,
      history: current.snapshot?.history ?? [],
      config,
      participants,
      participantCount,
    };
  }

  private async getRoomParticipants(roomId: string): Promise<SyncParticipant[]> {
    const state = await this.readRoomState(roomId);
    if (!state?.participants || state.participants.length === 0) return [];
    return state.participants
      .map((p, idx) => ({
        id: String(p?.id ?? idx + 1),
        name: String(p?.name ?? `P${idx + 1}`).slice(0, 10).toUpperCase(),
        color: String(p?.color ?? 'bg-cyan-500'),
      }))
      .filter((p) => Boolean(p.id) && Boolean(p.name));
  }

  async publishRoomConfig(participants: Founder[], count: number) {
    if (!this.roomCode) return;
    const current =
      (await this.readRoomState(this.roomCode)) ??
      ({ roomId: this.roomCode, updatedAt: Date.now(), eventSeq: 0, status: AuctionStatus.IDLE } as RoomState);

    const normalized = participants.slice(0, Math.max(1, Math.floor(count))).map((p, idx) => ({
      id: String(p.id ?? idx + 1),
      name: String(p.name ?? `P${idx + 1}`).slice(0, 10).toUpperCase(),
      color: String(p.color ?? 'bg-cyan-500'),
    }));

    const baseSnapshot = this.buildBaseSnapshot(current);

    const nextState: RoomState = {
      ...current,
      roomId: this.roomCode,
      updatedAt: Date.now(),
      participants: normalized,
      participantCount: Math.max(1, Math.floor(count)),
      snapshot: {
        ...baseSnapshot,
        participants: normalized,
        participantCount: Math.max(1, Math.floor(count)),
      },
    };

    await this.writeRoomState(this.roomCode, nextState);
  }

  async publishSnapshot(snapshot: SyncSnapshot) {
    if (!this.roomCode) return;
    const current =
      (await this.readRoomState(this.roomCode)) ??
      ({ roomId: this.roomCode, updatedAt: Date.now(), eventSeq: 0, status: snapshot.status } as RoomState);

    const nextState: RoomState = {
      ...current,
      roomId: this.roomCode,
      updatedAt: Date.now(),
      status: snapshot.status,
      participants: snapshot.participants,
      participantCount: snapshot.participantCount,
      snapshot,
    };

    await this.writeRoomState(this.roomCode, nextState);
  }

  async listClaimedParticipants(): Promise<Set<string>> {
    if (!this.roomCode) return new Set();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('room_participants')
      .select('founder_id')
      .eq('room_id', this.roomCode);

    if (error || !data) return new Set();
    return new Set(data.map((row) => String((row as { founder_id: string }).founder_id)));
  }

  async claimParticipant(founderId: string): Promise<boolean> {
    if (!this.roomCode) return false;
    const supabase = getSupabase();
    const userId = await this.initAuth();

    const configured = await this.getRoomParticipants(this.roomCode);
    if (configured.length > 0 && !configured.some((p) => p.id === founderId)) {
      throw new Error('Invalid participant slot for this room.');
    }

    await supabase.from('room_participants').upsert(
      {
        room_id: this.roomCode,
        founder_id: founderId,
        user_id: userId,
      },
      {
        onConflict: 'room_id,founder_id',
        ignoreDuplicates: true,
      },
    );

    const existing = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_id', this.roomCode)
      .eq('founder_id', founderId)
      .maybeSingle();

    return existing.data?.user_id === userId;
  }

  private async canBid(founderId: string): Promise<boolean> {
    if (!this.roomCode) return false;
    const supabase = getSupabase();
    const userId = await this.initAuth();
    const q = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_id', this.roomCode)
      .eq('founder_id', founderId)
      .maybeSingle();

    return q.data?.user_id === userId;
  }

  async joinRoom(code: string, onEvent: (event: SyncEvent) => void): Promise<JoinRoomResult> {
    this.leaveRoom();
    const supabase = getSupabase();

    const roomId = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!roomId) {
      return { participants: null, participantCount: null, snapshot: null };
    }
    this.roomCode = roomId;
    this.lastSeenEventSeq = 0;

    await this.getOrCreateRoomMeta(roomId);

    const existing = await this.readRoomState(roomId);
    this.dispatchIfNewer(existing, onEvent);
    this.emitSnapshot(existing?.snapshot);

    this.channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_rooms',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as { state?: RoomState };
          this.dispatchIfNewer(row?.state ?? null, onEvent);
          this.emitSnapshot(row?.state?.snapshot);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const claimed = await this.listClaimedParticipants();
          this.onParticipantsChanged?.(claimed);
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.onConnectionStatus?.('connected');
          const latest = await this.readRoomState(roomId);
          this.dispatchIfNewer(latest, onEvent);
          this.emitSnapshot(latest?.snapshot);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.onConnectionStatus?.('reconnecting');
          return;
        }
        if (status === 'CLOSED') {
          this.onConnectionStatus?.('disconnected');
        }
      });

    return {
      participants: existing?.participants ?? null,
      participantCount: existing?.participantCount ?? null,
      snapshot: existing?.snapshot ?? null,
    };
  }

  private deriveNextStatus(current: AuctionStatus, event: SyncEvent): AuctionStatus {
    if (event.type === 'START') return AuctionStatus.RUNNING;
    if (event.type === 'BID' || event.type === 'NO_DEAL') return AuctionStatus.ENDED;
    if (event.type === 'RESET') return AuctionStatus.IDLE;
    return current;
  }

  async sendEvent(event: SyncEvent) {
    if (!this.roomCode) return;
    const supabase = getSupabase();

    const roomId = this.roomCode;
    await this.getOrCreateRoomMeta(roomId);

    const current =
      (await this.readRoomState(roomId)) ??
      ({ roomId, updatedAt: Date.now(), eventSeq: 0, status: AuctionStatus.IDLE } as RoomState);

    if ((event.type === 'START' || event.type === 'RESET' || event.type === 'NO_DEAL') && !this.isHostForRoom) {
      throw new Error('Only host can control auction state.');
    }

    if (event.type === 'START' && current.status === AuctionStatus.ENDED) {
      throw new Error('Auction is ended. Host must reset before starting again.');
    }

    if (event.type === 'NO_DEAL' && current.status !== AuctionStatus.RUNNING) {
      throw new Error('No-deal update denied: auction is not running.');
    }

    if (event.type === 'BID') {
      const ok = await this.canBid(event.winnerId);
      if (!ok) {
        throw new Error('Bid denied: participant slot is not claimed by this user.');
      }
      if (current.status !== AuctionStatus.RUNNING) {
        throw new Error('Bid denied: auction is not running.');
      }

      const authoritativePrice = current.snapshot?.currentPrice;
      if (Number.isFinite(authoritativePrice) && Number.isFinite(event.clientSeenPrice)) {
        if (Number(authoritativePrice) !== Number(event.clientSeenPrice)) {
          throw new Error(`Price changed to $${Number(authoritativePrice).toLocaleString()}. Please tap ACCEPT again.`);
        }
      }
    }

    const nextSeq = (current.eventSeq ?? 0) + 1;
    const nextStatus = this.deriveNextStatus(current.status, event);

    const baseSnapshot = this.buildBaseSnapshot(current, event.type === 'START' ? event.config : undefined);
    let nextHistory: SyncHistoryEntry[] = [...baseSnapshot.history];
    let nextSnapshot: SyncSnapshot = {
      ...baseSnapshot,
      status: nextStatus,
    };

    if (event.type === 'START') {
      const config = event.config ?? baseSnapshot.config;
      nextHistory = [{ price: event.startPrice, timestamp: event.startTime, event: 'START' }];
      nextSnapshot = {
        ...baseSnapshot,
        status: AuctionStatus.RUNNING,
        currentPrice: event.startPrice,
        nextDropTime: event.startTime + config.dropIntervalMs,
        winnerId: null,
        history: nextHistory,
        config,
        participants: event.participants ?? baseSnapshot.participants,
        participantCount: event.participantCount ?? baseSnapshot.participantCount,
      };
    }

    if (event.type === 'BID') {
      const last = nextHistory[nextHistory.length - 1];
      if (last && last.event === 'DROP' && last.price === event.price) {
        nextHistory = nextHistory.slice(0, -1);
      }
      nextHistory = [...nextHistory, { price: event.price, timestamp: event.timestamp, event: 'WIN', details: event.winnerId }];
      nextSnapshot = {
        ...baseSnapshot,
        status: AuctionStatus.ENDED,
        currentPrice: event.price,
        nextDropTime: 0,
        winnerId: event.winnerId,
        history: nextHistory,
      };
    }

    if (event.type === 'NO_DEAL') {
      const last = nextHistory[nextHistory.length - 1];
      if (last && last.event === 'DROP' && last.price === event.price) {
        nextHistory = nextHistory.slice(0, -1);
      }
      if (!(last && last.event === 'NO_DEAL' && last.price === event.price)) {
        nextHistory = [...nextHistory, { price: event.price, timestamp: event.timestamp, event: 'NO_DEAL', details: 'Floor Reached' }];
      }
      nextSnapshot = {
        ...baseSnapshot,
        status: AuctionStatus.ENDED,
        currentPrice: event.price,
        nextDropTime: 0,
        winnerId: null,
        history: nextHistory,
      };
    }

    if (event.type === 'RESET') {
      const config = baseSnapshot.config;
      nextSnapshot = {
        ...baseSnapshot,
        status: AuctionStatus.IDLE,
        currentPrice: config.startPrice,
        nextDropTime: 0,
        winnerId: null,
        history: [],
      };
    }

    const nextState: RoomState = {
      ...current,
      roomId,
      lastEvent: event,
      updatedAt: Date.now(),
      eventSeq: nextSeq,
      status: nextStatus,
      participants: nextSnapshot.participants,
      participantCount: nextSnapshot.participantCount,
      snapshot: nextSnapshot,
    };

    await this.writeRoomState(roomId, nextState);

    const legalMeta =
      event.type === 'START' || event.type === 'BID'
        ? { termsVersion: 'v0.1', consentAt: Date.now() }
        : {};

    await supabase.from('auction_events').insert({
      room_id: roomId,
      event_type: event.type,
      payload: {
        ...event,
        ...legalMeta,
        eventSeq: nextSeq,
        actorUserId: this.currentUserId,
      },
    });
  }

  leaveRoom() {
    if (this.channel) {
      void getSupabase().removeChannel(this.channel);
      this.channel = null;
    }
    this.roomCode = null;
    this.isHostForRoom = false;
    this.lastSeenEventSeq = 0;
    this.onParticipantsChanged = null;
    this.onConnectionStatus = null;
    this.onSnapshotChanged = null;
  }
}

export const syncService = new SyncService();
