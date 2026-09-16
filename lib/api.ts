import {guestTokenFromCookie,guestOwner} from './guest.ts';
import { ApiError, authorizeWrite, authorizeOrigin } from './access';
export { ApiError } from './access';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { MAX_REPORT_BYTES } from './benchmark';
export function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
export async function writer(request: Request) {
  authorizeOrigin(request,process.env.BETTER_AUTH_URL);
  const user = await getChatGPTUser();
  const token=guestTokenFromCookie(request.headers.get('cookie'));
  const owner=user?.userId ?? (token?await guestOwner(token):null);
  if(!owner)throw new ApiError(401,'Open TokFire to start a guest session. No sign-in is required.');
  return authorizeWrite(request,owner,process.env.BETTER_AUTH_URL);
}
export async function body(request: Request, maxBytes = MAX_REPORT_BYTES) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Expected JSON');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(413, 'Report too large');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Missing report');
  const chunks: Uint8Array[] = []; let count = 0;
  while (true) {
    const {done, value} = await reader.read(); if(done) break;
    count += value.length;
    if(count > maxBytes) { await reader.cancel(); throw new ApiError(413, 'Report too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(count); let at=0;
  for(const chunk of chunks) {bytes.set(chunk,at);at+=chunk.length;}
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch {throw new ApiError(400,'Invalid JSON');}
}
export function failure(error: unknown) {
  if(error instanceof ApiError) return json({error:error.message},error.status);
  // Do not log report contents, account identity or database values.
  console.error('Benchmark storage operation failed');
  return json({error:'Storage is temporarily unavailable. Your local report is unchanged.'},503);
}
