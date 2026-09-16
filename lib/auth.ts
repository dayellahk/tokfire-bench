import {betterAuth} from 'better-auth';
import {createPool} from 'mysql2/promise';
import {portalAuthPlugins} from './auth-security.ts';
import {socialAuthOptions} from './social-auth.ts';
function createAuth(){
  const databaseURL=process.env.DATABASE_URL,secret=process.env.BETTER_AUTH_SECRET,baseURL=process.env.BETTER_AUTH_URL;
  if(!databaseURL||!secret||secret.length<32||!baseURL)throw new Error('Database and authentication configuration required');
  return betterAuth({
   appName:'TokFire Bench',baseURL,secret,plugins:portalAuthPlugins(),
   database:createPool({uri:databaseURL,connectionLimit:3,decimalNumbers:true}),
   emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128},
   ...socialAuthOptions(),
   onAPIError:{errorURL:baseURL+'/signin'},
   rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:3}}},
   trustedOrigins:[baseURL],session:{expiresIn:60*60*24*7,updateAge:60*60*24},
  });
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth(){ return auth ??= createAuth(); }
