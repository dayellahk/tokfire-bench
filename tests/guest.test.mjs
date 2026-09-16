import test from 'node:test';import assert from 'node:assert/strict';
import {newGuestToken,validGuestToken,guestOwner,guestTokenFromCookie} from '../lib/guest.ts';
import {authorizeOrigin} from '../lib/access.ts';
test('guest credential has 256 random bits, stable hashed ownership and independent sessions',async()=>{
 const a=newGuestToken(),b=newGuestToken();assert(validGuestToken(a));assert.notEqual(a,b);assert.equal(a.length,64);
 const owner=await guestOwner(a);assert.equal(owner,await guestOwner(a));assert.notEqual(owner,await guestOwner(b));assert(!owner.includes(a));assert(owner.startsWith('guest:'));
});
test('missing, malformed and duplicate credentials never identify a guest',async()=>{
 for(const token of ['',null,'guest:admin','a'.repeat(63),'A'.repeat(64)]){assert(!validGuestToken(token));assert.equal(guestTokenFromCookie('tokfire_guest='+token),null);}
 const token=newGuestToken();assert.equal(guestTokenFromCookie('other=x; tokfire_guest='+token),token);assert.equal(guestTokenFromCookie('tokfire_guest='+token+'; tokfire_guest='+token),null);
 await assert.rejects(guestOwner('owner-id'));
});
test('guest uploads retain origin protection',()=>{
 assert.doesNotThrow(()=>authorizeOrigin(new Request('https://tokfires.com/api/v2/submissions',{headers:{origin:'https://tokfires.com'}}),'https://tokfires.com'));
 for(const headers of [{origin:'https://evil.invalid'},{'sec-fetch-site':'cross-site'}])assert.throws(()=>authorizeOrigin(new Request('https://tokfires.com/api/v2/submissions',{headers}),'https://tokfires.com'),e=>e.status===403);
});
