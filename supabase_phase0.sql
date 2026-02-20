-- Phase 0 hardening migration
-- Run in Supabase SQL Editor

create table if not exists public.rooms (
  room_id text primary key,
  host_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_participants (
  room_id text not null,
  founder_id text not null,
  user_id uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (room_id, founder_id)
);

alter table public.auction_rooms
  add column if not exists updated_at timestamptz not null default now();

-- RLS
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;

-- rooms policies
drop policy if exists "rooms read" on public.rooms;
drop policy if exists "rooms insert" on public.rooms;
create policy "rooms read" on public.rooms for select to authenticated using (true);
create policy "rooms insert" on public.rooms for insert to authenticated with check (auth.uid() = host_user_id);

-- participant claim policies
drop policy if exists "participants read" on public.room_participants;
drop policy if exists "participants claim" on public.room_participants;
create policy "participants read" on public.room_participants for select to authenticated using (true);
create policy "participants claim" on public.room_participants for insert to authenticated with check (auth.uid() = user_id);

-- tighten previous open policies to authenticated-only
alter table public.auction_rooms enable row level security;
alter table public.auction_events enable row level security;

drop policy if exists "rooms read" on public.auction_rooms;
drop policy if exists "rooms insert" on public.auction_rooms;
drop policy if exists "rooms update" on public.auction_rooms;

create policy "auction_rooms read" on public.auction_rooms for select to authenticated using (true);
create policy "auction_rooms write" on public.auction_rooms for insert to authenticated with check (true);
create policy "auction_rooms update" on public.auction_rooms for update to authenticated using (true) with check (true);

drop policy if exists "events read" on public.auction_events;
drop policy if exists "events insert" on public.auction_events;

create policy "auction_events read" on public.auction_events for select to authenticated using (true);
create policy "auction_events insert" on public.auction_events for insert to authenticated with check (true);

-- Realtime publications
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_participants;
alter publication supabase_realtime add table public.auction_rooms;
alter publication supabase_realtime add table public.auction_events;
