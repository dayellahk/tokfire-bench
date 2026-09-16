import { body, writer, json, failure } from '@/lib/api';
import { rawDb } from '@/db/raw';
import { saveSubmission, ownSubmissions } from '@/lib/repository';
import {uploadRateLimit} from '@/lib/integrity';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {const owner=await writer(request);await uploadRateLimit(rawDb(),request,owner,'upload');return json(await saveSubmission(rawDb(),owner,await body(request)),201);}
  catch(error){return failure(error);}
}
export async function GET(request:Request) {
  try {const owner=await writer(request);const {results}=await ownSubmissions(rawDb(),owner);return json({results});}
  catch(error){return failure(error);}
}
