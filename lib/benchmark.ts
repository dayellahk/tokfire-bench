import { z } from 'zod';

export const SPEC_VERSION = 'local-ai-text-v1';
export const CONSENT_VERSION = '2026-09-15-v1';
export const MAX_REPORT_BYTES = 200_000;
const positive = z.number().finite().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sample = z.object({
  inputTokens: z.union([z.literal(512), z.literal(2048)]), outputTokens: z.literal(128),
  repeat: z.number().int().min(1).max(3), ttftMs: positive.max(600_000),
  prefillTps: positive.max(10_000_000), decodeTps: positive.max(1_000_000),
  prefillMs: positive.max(600_000), decodeMs: positive.max(600_000), elapsedMs: positive.max(1_200_000),
}).strict().superRefine((s, ctx) => {
  if (s.ttftMs > s.elapsedMs || Math.abs(s.prefillTps * s.prefillMs / 1000 - s.inputTokens) > 1 ||
      Math.abs(s.decodeTps * s.decodeMs / 1000 - s.outputTokens) > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent timing or token counts' });
  }
});
const model = z.object({
  modelSha256: hash, modelBytes: positive.int().max(2 ** 41), loadMs: positive.max(600_000),
  peakProcessRssBytes: positive.int().max(2 ** 42).nullable(), samples: z.array(sample).length(6),
}).strict().superRefine((m, ctx) => {
  const keys = new Set(m.samples.map(s => `${s.inputTokens}:${s.repeat}`));
  if (keys.size !== 6) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Need exactly three repetitions for each workload' });
});
export const reportSchema = z.object({
  specVersion: z.literal(SPEC_VERSION), runnerVersion: z.enum(['0.2.0', '0.2.1']), runId: z.string().uuid(),
  measuredAt: z.string().datetime(),
  hardware: z.object({
    chip: z.string().regex(/^Apple M[0-9]+(?: (?:Pro|Max|Ultra))?$/),
    machine: z.string().regex(/^[A-Za-z]+[0-9]+,[0-9]+$/).max(40),
    cpuCores: positive.int().max(512), memoryBytes: positive.int().max(2 ** 43),
    osVersion: z.string().regex(/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/),
  }).strict(),
  runtime: z.object({
    name: z.literal('llama.cpp'), binarySha256: hash, versionSha256: hash,
    threads: positive.int().max(512), contextTokens: z.literal(4096), gpuLayers: z.literal(999),
    batchTokens: z.literal(512), ubatchTokens: z.literal(512), flashAttention: z.literal(false), kvCache: z.literal('f16'),
  }).strict(),
  models: z.array(model).min(1).max(5),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.models.map(m => m.modelSha256)).size !== r.models.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate model content' });
  if (r.runtime.threads !== r.hardware.cpuCores) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Thread count does not match standard profile' });
});
export const uploadSchema = z.object({
  report: reportSchema,
  consent: z.object({ collect: z.literal(true), publish: z.boolean(), version: z.literal(CONSENT_VERSION) }).strict(),
}).strict();
export type BenchmarkReport = z.infer<typeof reportSchema>;
export type Measurement = {
  modelHash: string; inputTokens: number; decodeTps: number; ttftMs: number; prefillTps: number;
  decodeMin: number; decodeMax: number; peakRssBytes: number | null; loadMs: number;
};
export function median(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.floor(sorted.length/2)];
}
export function summarize(report: BenchmarkReport): Measurement[] {
  return report.models.flatMap(m => [512,2048].map(inputTokens => {
    const samples = m.samples.filter(s => s.inputTokens === inputTokens);
    return { modelHash: m.modelSha256, inputTokens,
      decodeTps: median(samples.map(s => s.decodeTps)), ttftMs: median(samples.map(s => s.ttftMs)),
      prefillTps: median(samples.map(s => s.prefillTps)), decodeMin: Math.min(...samples.map(s => s.decodeTps)),
      decodeMax: Math.max(...samples.map(s => s.decodeTps)), peakRssBytes: m.peakProcessRssBytes, loadMs: m.loadMs };
  }));
}
export async function cohortKey(report: BenchmarkReport, row: Measurement) {
  // Binary hash pins the actual runtime build; model hash pins architecture + quantization + tokenizer.
  const encoded = new TextEncoder().encode(JSON.stringify([report.specVersion, row.modelHash, row.inputTokens, 128, report.runtime]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))).map(b => b.toString(16).padStart(2,'0')).join('');
}
export function responsiveness(decode: number, ttft: number) {
  if (decode >= 30 && ttft <= 1000) return 'Fast interaction';
  if (decode >= 15 && ttft <= 3000) return 'Comfortable';
  if (decode >= 7 && ttft <= 10000) return 'Slower interaction';
  return 'Prefer smaller models';
}
