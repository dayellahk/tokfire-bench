// External reference data is private; this retired endpoint must never expose it.
function retired(){return Response.json({error:'Not found'},{status:404,headers:{'Cache-Control':'no-store'}});}
export const GET=retired;
export const POST=retired;
