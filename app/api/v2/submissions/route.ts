import {body,writer,json,failure} from '@/lib/api';
import {rawDb} from '@/db/raw';
import {storeNativeSubmission} from '@/lib/repository';
import {uploadRateLimit} from '@/lib/integrity';
export async function POST(request:Request){try{
 const owner=await writer(request),db=rawDb();
 await uploadRateLimit(db,request,owner,'upload');
 const result=await storeNativeSubmission(db,owner,await body(request,4_000_000));
 return json(result,'duplicate' in result?200:201);
}catch(e){return failure(e);}}
