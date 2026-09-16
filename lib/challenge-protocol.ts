import {z} from 'zod';
export const challengeEvidenceSchema=z.object({id:z.string().uuid(),nonce:z.string().regex(/^[a-f0-9]{64}$/),requestDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const challengeConfigSchema=z.object({workload:z.enum(['short-chat','business','long-summary','agent-tools','agent-data','agent-research','agent-recovery']),engine:z.enum(['llama.cpp','oMLX','Ollama','vLLM']),model:z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/),concurrencyLevels:z.array(z.number().int().min(1).max(20)).min(1).max(9),repeats:z.number().int().min(3).max(5)}).strict().refine(c=>c.concurrencyLevels.every((n,i)=>i===0||n>c.concurrencyLevels[i-1]));
export type ChallengeConfig=z.infer<typeof challengeConfigSchema>;
export type ChallengeEvidence=z.infer<typeof challengeEvidenceSchema>;
