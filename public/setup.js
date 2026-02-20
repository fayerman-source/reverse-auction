// Auction admin setup file.
// Edit values below, then rebuild/redeploy.
window.AUCTION_SETUP = {
  // Supabase public client config (safe to expose in frontend)
  supabaseUrl: 'https://icbkcmqowouatasebisy.supabase.co',
  supabaseAnonKey: 'sb_publishable_AzGHk6X-BKXXpcrsdcFGog_E5--VTpt',

  startPrice: 20000,
  floorPrice: 1000,
  decrementAmount: 1000,
  dropIntervalMs: 10000,

  // Number of participant buttons shown.
  participantCount: 3,

  // Optional explicit participant list.
  // If participantCount > participants.length, additional generic participants are generated.
  participants: [
    { id: '1', name: 'EF', color: 'bg-rose-500' },
    { id: '2', name: 'EG', color: 'bg-indigo-500' },
    { id: '3', name: 'AG', color: 'bg-emerald-500' },
  ],
};
