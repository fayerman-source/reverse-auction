# Launch Runbook (Host)

Use this checklist for live auctions.

## Pre-session (5 minutes)

1. Open app on host device.
2. Click **Setup** and verify:
   - Start Price
   - Floor Price (must be lower than Start)
   - Decrement
   - Drop Interval
   - Participant Initials
3. Click **Apply & Reset**.

## Start remote session

1. Click **Go Remote**.
2. Enter short room code (e.g. `auction1`) and click **JOIN**.
3. Select your participant slot.
4. Use **Copy** to share room code with others.

## Participant join flow

Each participant should:
1. Open the app URL.
2. Click **Go Remote**.
3. Enter room code and click **JOIN**.
4. Select assigned participant slot.

## Start conditions

- START remains disabled until all participant slots are claimed.
- Only host can start/reset.

## Run the auction

1. Click **START**.
2. Confirm in modal: **Acknowledge & Start**.
3. Participants bid from their own claimed slot.
4. Winner is locked and displayed across clients.

## End/reset

- If a winner accepts, host sees **RESET**.
- If floor is reached with no winner, host sees **RESET**.
- Click RESET to begin a new round.

## Fast recovery

If someone joins wrong room or gets stuck:
- Use **← Back** in identity modal.
- Rejoin with correct room code.

If testing data is stale in Supabase:
- clear `room_participants`, `auction_rooms`, `auction_events`, `rooms` rows for test rooms.

## Known non-blocking caveats

- Claimed participant list refresh is polling-based (few seconds).
- Minor countdown edge-frame behavior may appear at very low intervals.
