import { z } from 'zod';
import { CONSENT_VERSION } from '@/lib/benchmark';
import { writer, body, json, ApiError, failure } from '@/lib/api';
import { rawDb } from '@/db/raw';
import { publication, deleteSubmission } from '@/lib/repository';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
const change=z.object({publish:z.boolean(),version:z.literal(CONSENT_VERSION)}).strict();
export async function PATCH(request:Request,context:Context) {
  try {
    const owner=await writer(request),{id}=await context.params;
    const parsed=change.safeParse(await body(request));
    if(!parsed.success)throw new ApiError(400,'Invalid publication consent');
    return json(await publication(rawDb(),owner,id,parsed.data.publish,parsed.data.version));
  }catch(error){return failure(error);}
}
export async function DELETE(request:Request,context:Context) {
  try {const owner=await writer(request),{id}=await context.params;return json(await deleteSubmission(rawDb(),owner,id));}
  catch(error){return failure(error);}
}
