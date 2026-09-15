import { rawDb } from '@/db/raw';
import { json, failure } from '@/lib/api';
import { leaderboard } from '@/lib/repository';
export const dynamic='force-dynamic';
export async function GET() {
  try {const {results}=await leaderboard(rawDb());return json({results,verification:'community-unverified'});}
  catch(error){return failure(error);}
}
