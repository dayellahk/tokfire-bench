import { env } from 'cloudflare:workers';
export function rawDb() {
  if (!env.DB) throw new Error('Benchmark database unavailable');
  return env.DB;
}
