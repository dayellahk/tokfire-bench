import {rawDb} from '@/db/raw';
export const dynamic='force-dynamic';
export async function GET(){
 try {await rawDb().prepare('SELECT 1 AS ok').first();return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
