# Reverse Auction

A fully client-side reverse (Dutch) auction app that is:
- **provider-agnostic** (no Google AI Studio dependency)
- **GitHub Pages deployable**
- **admin-configurable** via a setup file

## Admin configuration

Edit `public/setup.js` to control:
- `participantCount`
- `startPrice`
- `floorPrice`
- `decrementAmount`
- `dropIntervalMs`
- `participants` (optional explicit list)

Example:

```js
window.AUCTION_SETUP = {
  startPrice: 20000,
  floorPrice: 1000,
  decrementAmount: 1000,
  dropIntervalMs: 10000,
  participantCount: 4,
  participants: [
    { id: '1', name: 'A', color: 'bg-rose-500' },
    { id: '2', name: 'B', color: 'bg-indigo-500' },
  ],
};
```

If `participantCount` is greater than `participants.length`, the app auto-generates the remaining participants.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages deployment

This repo includes a Pages workflow at `.github/workflows/deploy-pages.yml`.

1. In GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push to `main`
3. Workflow builds and deploys `dist/`
