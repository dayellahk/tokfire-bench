import {body,writer,json,failure} from '@/lib/api';
import {rawDb} from '@/db/raw';
import {issueChallenge,uploadRateLimit} from '@/lib/integrity';
export async function POST(request:Request){try{
 const owner=await writer(request),db=rawDb();
 await uploadRateLimit(db,request,owner,'challenge');
 return json(await issueChallenge(db,owner,await body(request,4096)),201);
}catch(e){return failure(e);}}
