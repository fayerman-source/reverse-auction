# Reverse Auction (Dutch Auction) Web App

A modern, real-time **Reverse Auction / Dutch Auction** app built with **React + TypeScript + Vite**.

This project is designed for teams that need a fast, configurable auction interface for:
- procurement simulations
- startup deal games
- classroom demos
- live price-discovery exercises
- internal bidding workshops

It is fully frontend-based, easy to host, and optimized for **GitHub Pages deployment**.

---

## Why this project

Unlike fixed auction demos, this app is designed to be:

- **Provider-agnostic** – no Google AI Studio lock-in, no LLM API dependency required
- **Configurable** – auction rules can be changed from the UI and from a setup file
- **Deployable anywhere** – static build output (`dist/`) works on GitHub Pages, Netlify, Vercel, etc.
- **Realtime-capable** – supports lightweight room sync using topic-based event streaming

---

## Features

### Core auction flow
- Descending-price (Dutch) auction logic
- Configurable start price, floor price, decrement amount, and tick interval
- Automatic stop when floor is reached
- Winner capture at current price
- Live auction history panel
- Sound cues for start, drop, bid, and end events

### Remote room mode
- Join a shared room code
- Multi-user interaction with participant identity selection
- Realtime START / BID / RESET event propagation

### Admin configuration
You can configure auction behavior in **two ways**:

1. **Frontend Setup panel (GUI)**
   - Start price
   - Floor price
   - Decrement amount
   - Drop interval
   - Participant count

2. **Static setup file** (`public/setup.js`)
   - Preload defaults before app startup
   - Useful for production presets and event-specific tuning

---

## Tech stack

- **React 19**
- **TypeScript**
- **Vite**
- **Tailwind CSS (CDN)** for styling
- Browser-native audio APIs for sound effects

---

## Project structure

```text
.
├── App.tsx                 # Main app state + auction runtime + setup modal
├── constants.ts            # Initial config + participant generation helpers
├── types.ts                # Domain types (AuctionConfig, AuctionState, Founder, etc.)
├── components/
│   ├── Ticker.tsx          # Price display + countdown bar
│   └── FounderButton.tsx   # Participant bidding controls
├── services/
│   ├── soundService.ts     # Audio feedback
│   └── syncService.ts      # Realtime room events
├── public/
│   └── setup.js            # Static startup config
└── .github/workflows/
    └── deploy-pages.yml    # GitHub Pages deploy workflow
```

---

## Local development

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- npm

### Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:3000`).

### Production build

```bash
npm run build
npm run preview
```

---

## Configuration

### Option A: Configure at runtime via GUI
Use the **Setup** button in the app header.

### Option B: Configure defaults via `public/setup.js`

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
    { id: '3', name: 'AG', color: 'bg-emerald-500' },
    { id: '4', name: 'ZZ', color: 'bg-cyan-500' },
  ],
};
```

If `participantCount` is larger than the provided `participants` array, the app auto-generates additional participant identities.

---

## Deploy to GitHub Pages

This repository includes a workflow at:

- `.github/workflows/deploy-pages.yml`

### Setup steps
1. Go to **Repository Settings → Pages**
2. Under **Build and deployment**, set **Source = GitHub Actions**
3. Push to `main`
4. GitHub Actions builds and deploys `dist/`

After successful deploy, your site is available at:

- `https://<your-username>.github.io/<repo-name>/`

---

## SEO / discoverability keywords

If you are searching for this type of project, relevant terms include:

- reverse auction app
- dutch auction web app
- descending price auction
- procurement auction simulator
- live bidding interface
- auction price discovery tool
- React TypeScript auction project

---

## Contributing

Issues and PRs are welcome.

If you propose a change, include:
- expected auction behavior
- screenshots or short screen recording
- reproduction steps for any bug

---

## License

Add your preferred license (MIT/Apache-2.0/etc.) in `LICENSE`.
