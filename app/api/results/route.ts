// Disable legacy ingestion: it accepted unverified demo scores with no consent record.
export function POST() { return Response.json({error:'Demo uploads disabled. Import a real native report using /api/v1/submissions.'},{status:410}); }
export function GET() { return Response.json({error:'Use /api/v1/leaderboard.'},{status:410}); }
