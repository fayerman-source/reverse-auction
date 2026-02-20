# Reverse Auction Remote Security Audit & Hardening Plan

Date: 2026-02-19
Scope: `App.tsx`, `services/syncService.ts`, Supabase table/policy model

## Executive Summary

Current remote mode works functionally, but trust boundaries are weak:
- any client can write room state/events
- participant identity is not enforced server-side
- no host/admin role for start/reset controls
- no event ordering/anti-replay guard

This is fine for friendly demos, not safe for adversarial or high-stakes auctions.

---

## Findings

## 1) Anyone can overwrite any room state
Severity: **Critical**

Why:
- RLS currently allows broad `anon` read/write/update.
- `auction_rooms` uses simple upsert by `room_id`.

Impact:
- any user can hijack/reset/end any room if they know room code.

Fix:
- require authenticated users (`authenticated` only).
- tie room writes to role checks (host vs participant) via membership table + RLS.

---

## 2) No authoritative role model (host/admin vs bidder)
Severity: **High**

Why:
- `START`/`RESET` can be sent by any connected client.

Impact:
- participants can restart/interrupt auction or force outcomes.

Fix:
- add `rooms` table with `host_user_id`.
- allow `START`/`RESET` from host only.
- optionally allow host to lock room after start.

---

## 3) Participant identity collision (two users can pick same initials)
Severity: **High**

Why:
- identity (`myFounderId`) is local UI state only.
- no server-side claim/lock for participant slot.

Impact:
- one bidder can impersonate another slot.

Fix:
- add `room_participants(room_id, founder_id, user_id, claimed_at)` unique `(room_id, founder_id)`.
- claim endpoint/upsert with conflict handling.
- only claimer can bid for that founder_id.

---

## 4) No event sequencing, idempotency, or anti-replay
Severity: **High**

Why:
- state applies latest write without monotonic checks.
- old events can be resent.

Impact:
- stale or replayed events can roll back/fork state.

Fix:
- include `event_seq` monotonic integer in room state.
- reject events with `seq <= current_seq`.
- include `event_id` UUID for dedupe.

---

## 5) Client-side authorization only
Severity: **High**

Why:
- `handleBid` UI prevents wrong clicks, but a modified client can still send raw events.

Impact:
- bypasses UI guardrails.

Fix:
- move event validation server-side (Supabase RPC/Edge Function):
  - verify room status
  - verify role permissions
  - verify participant claim ownership
  - perform atomic state transition

---

## 6) Setup panel can change auction parameters mid-room (local authority confusion)
Severity: **Medium**

Why:
- setup is local and can change start params before emitting `START`.

Impact:
- multiple clients may expect different parameters.

Fix:
- make config part of room authoritative state set by host only.
- participants read-only config once room joined.

---

## 7) Predictable room codes, no join secret
Severity: **Medium**

Why:
- simple room code with no password/token.

Impact:
- unauthorized joins/writes if code guessed/shared.

Fix:
- optional room passcode or signed invite token.

---

## 8) Missing rate limiting / abuse controls
Severity: **Medium**

Why:
- no throttling on event writes.

Impact:
- spam events, accidental rapid reset/start loops.

Fix:
- per-user per-room event throttle (DB check / Edge Function).

---

## Hardening Plan (Fast Iteration)

## Phase 0 (today/tomorrow - minimal safe)
1. Disable anonymous writes (auth required).
2. Add host-only control for `START` and `RESET`.
3. Add participant claim lock table and enforce bid ownership.
4. Add `event_seq` monotonic check.

Outcome: prevents identity hijack + unauthorized reset/start.

## Phase 1 (next)
1. Move transitions to server-side RPC/Edge Function.
2. Add idempotency (`event_id`) and replay rejection.
3. Add room config authority model (host-set, participant read-only).

## Phase 2 (production hardening)
1. Add passcode/invite token.
2. Add throttling + abuse detection.
3. Add immutable event receipt export and retention controls.

---

## Suggested Immediate Implementation Order

1. Supabase schema additions:
- `rooms` (host ownership)
- `room_participants` (slot claims)
- `auction_rooms.event_seq`

2. RLS updates:
- reads broad as needed
- writes restricted to validated role paths

3. Client updates:
- claim participant slot before enabling bid
- disable setup edits for non-host in remote rooms
- include `event_seq` with each write

4. Transition endpoint:
- single RPC/Edge Function to validate and apply state atomically

---

## Quick Product Rules to Enforce

- Only host can start/reset.
- Bidder can bid only for their claimed participant.
- Auction cannot restart from ENDED unless host explicitly opens a new round.
- Every event must be newer (`seq`) than current state.
