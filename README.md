# Reverse Auction (Dutch Auction)

A configurable, real-time reverse auction web app built with React, TypeScript, and Vite.

## Overview

This app runs a descending-price (Dutch) auction where participants accept the current price to win.

It supports:
- local single-screen usage
- remote shared rooms across locations
- runtime configuration from the UI
- startup defaults via `public/setup.js`

## Current Remote Architecture

Remote mode is now powered by **Supabase Realtime** (not ntfy relay).

- Room state stored in `auction_rooms`
- Optional event log in `auction_events`
- Join-time state hydration
- Live updates via Postgres changes subscription

## Features

- Descending-price auction flow
- Configurable start price, floor price, decrement amount, and tick interval
- Automatic stop when floor is reached
- Winner capture at current price
- Auction history view
- Sound cues (start, drop, bid, end)
- Remote room mode (join by code)
- Participant identity selection in remote mode
- Setup modal for runtime reconfiguration
- Configurable participant initials (comma-separated)
- Custom favicon (`public/favicon.ico`)

## Configuration

You can configure auction behavior in two ways.

### 1) Frontend setup panel (GUI)
Use the **Setup** button in the header to adjust:
- start price
- floor price
- decrement amount
- drop interval
- number of participants
- participant initials (comma-separated)

### 2) `public/setup.js`
Set startup defaults before the app loads:

```js
window.AUCTION_SETUP = {
  startPrice: 20000,
  floorPrice: 1000,
  decrementAmount: 1000,
  dropIntervalMs: 10000,
  participantCount: 4,
  participants: [
    { id: '1', name: 'EF', color: 'bg-rose-500' },
    { id: '2', name: 'EG', color: 'bg-indigo-500' },
  ],
};
```

If `participantCount` is greater than `participants.length`, extra participants are generated automatically.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS (CDN)
- Supabase (Postgres + Realtime)

## Project Structure

```text
.
├── App.tsx
├── constants.ts
├── types.ts
├── components/
│   ├── Ticker.tsx
│   └── FounderButton.tsx
├── services/
│   ├── soundService.ts
│   └── syncService.ts
├── public/
│   ├── setup.js
│   ├── favicon.ico
│   └── favicon.png
└── .github/workflows/
    └── deploy-pages.yml
```

## Local Development

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- npm

### Environment
Create `.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Run

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
npm run preview
```

## Database Setup (Supabase)

Run `supabase_phase0.sql` in Supabase SQL Editor.

This creates and hardens:
- `rooms` (host ownership)
- `room_participants` (participant slot claims)
- `auction_rooms` (authoritative room state)
- `auction_events` (event log)

Then verify these tables are in the `supabase_realtime` publication.

## GitHub Pages Deployment

A deployment workflow is included at:

- `.github/workflows/deploy-pages.yml`

Setup:
1. Go to **Settings → Pages**
2. Set **Source** to **GitHub Actions**
3. In **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to `main`

After a successful run, the site is available at:

- `https://<username>.github.io/<repo-name>/`

## Legal Disclaimer

This project and its documentation are for technical and informational purposes only and do **not** constitute legal advice.
Legal enforceability and compliance obligations vary by jurisdiction and use case.
Consult qualified legal counsel before relying on this software for legally binding transactions.

## Contributing

Pull requests and issues are welcome.

## License

Add a license file (`LICENSE`) for your preferred license terms.
