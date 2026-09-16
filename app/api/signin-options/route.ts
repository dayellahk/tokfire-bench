import {turnstileOptions} from '@/lib/turnstile';
import {signInOptions} from '@/lib/social-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({...signInOptions(),turnstile:turnstileOptions()}, {headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
