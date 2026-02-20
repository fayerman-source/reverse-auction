import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuctionStatus, SyncEvent } from '../types';

const runtimeSetup = (window as any).AUCTION_SETUP ?? {};

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (runtimeSetup.supabaseUrl as string | undefined);
const anon =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (runtimeSetup.supabaseAnonKey as string | undefined);

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
};

type RoomMeta = {
  room_id: string;
  host_user_id: string;
};

class SyncService {
  private roomCode: string | null = null;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private currentUserId: string | null = null;
  private isHostForRoom = false;

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

  async claimParticipant(founderId: string): Promise<boolean> {
    if (!this.roomCode) return false;
    const supabase = getSupabase();
    const userId = await this.initAuth();

    const res = await supabase.from('room_participants').insert({
      room_id: this.roomCode,
      founder_id: founderId,
      user_id: userId,
    });

    if (!res.error) return true;

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

  async joinRoom(code: string, onEvent: (event: SyncEvent) => void) {
    this.leaveRoom();
    const supabase = getSupabase();

    const roomId = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!roomId) return;
    this.roomCode = roomId;

    await this.getOrCreateRoomMeta(roomId);

    const existing = await this.readRoomState(roomId);
    if (existing?.lastEvent) {
      onEvent(existing.lastEvent);
    }

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
          const ev = row?.state?.lastEvent;
          if (ev) onEvent(ev);
        },
      )
      .subscribe();
  }

  private deriveNextStatus(current: AuctionStatus, event: SyncEvent): AuctionStatus {
    if (event.type === 'START') return AuctionStatus.RUNNING;
    if (event.type === 'BID') return AuctionStatus.ENDED;
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

    if ((event.type === 'START' || event.type === 'RESET') && !this.isHostForRoom) {
      throw new Error('Only host can start/reset.');
    }

    if (event.type === 'START' && current.status === AuctionStatus.ENDED) {
      throw new Error('Auction is ended. Host must reset before starting again.');
    }

    if (event.type === 'BID') {
      const ok = await this.canBid(event.winnerId);
      if (!ok) {
        throw new Error('Bid denied: participant slot is not claimed by this user.');
      }
      if (current.status !== AuctionStatus.RUNNING) {
        throw new Error('Bid denied: auction is not running.');
      }
    }

    const nextSeq = (current.eventSeq ?? 0) + 1;
    const nextStatus = this.deriveNextStatus(current.status, event);

    const nextState: RoomState = {
      roomId,
      lastEvent: event,
      updatedAt: Date.now(),
      eventSeq: nextSeq,
      status: nextStatus,
    };

    await this.writeRoomState(roomId, nextState);

    await supabase.from('auction_events').insert({
      room_id: roomId,
      event_type: event.type,
      payload: {
        ...event,
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
  }
}

export const syncService = new SyncService();
