// Server configuration only. Never serialize these options to the browser.
export function googleProvider(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return {clientId, clientSecret, prompt: 'select_account' as const, includeGrantedScopes: false};
}

export function signInOptions(env: NodeJS.ProcessEnv = process.env) {
  return {google: Boolean(googleProvider(env))};
}

export function socialAuthOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    socialProviders: {google: googleProvider(env)},
    account: {encryptOAuthTokens: true, accountLinking: {enabled: false}},
  };
}
