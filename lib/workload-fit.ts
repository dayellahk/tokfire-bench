import {isAgentWorkload,type WorkloadReport} from './workloads.ts';

// Fingerprints of the shipped 0.7 Python/Android profiles, not user-supplied labels.
export const WORKLOAD_FINGERPRINTS = {
  'short-chat': 'e41fc68cf63a8d8901135f48fe36461753ed6570e956d8035b043d68433d15c9',
  business: '9c04d0c111d7c4735d0278713cc1db8247876423ccecb70d59cb5d7147855b00',
  'long-summary': '762b718555a97d6ea87a12d5315e090770ceea3f296f7607f9d10ff422eef2a3',
  'agent-tools': 'b205c9392de20f87ec3b40533e20a9ac4eb3ed6f6534845c427992afe80b566c',
  'agent-data': '0247ccdb40faf7f19027c0160636497b0bef471ecef6fb7769f2d7864b8fae01',
  'agent-research': '0e3d559c767461d5a8060b4d9bb9b1d40529e3fbcefeab4ae7fec8279adf9d1c',
  'agent-recovery': '967a5035bb4e07d9a1eda5d12136cc5eeec2a2a38e73bb3a20bb0fc2e003d6e4',
} as const;
export type FitGrade = 'A' | 'B' | 'C' | 'D' | 'U';
export const FIT_LABELS: Record<FitGrade, string> = {
  A: 'Parallel tool tasks', B: 'Single tool task', C: 'Chat / text work',
  D: 'Needs tuning', U: 'Not assessed',
};
export const FIT_REASONS = {
  'smooth': 'All tasks completed and every request met the interaction guideline.',
  'incomplete': 'Some tasks failed or were incomplete.',
  'tool-errors': 'Tool protocol errors were recorded.',
  'missing-metrics': 'Runtime decode speed or first-visible latency is missing.',
  'slow-decode': 'At least one request decoded below 30 tok/s.',
  'slow-visible': 'At least one request took over 3 s to produce visible output.',
  'remote-hardware': 'The inference server hardware was not measured by this client.',
  'unknown-profile': 'The workload fingerprint does not match a shipped workload profile.',
} as const;
export type FitReason = keyof typeof FIT_REASONS;
export type FitLevel = {
  jobs: number; grade: FitGrade; reasons: FitReason[]; attempts: number; complete: number;
  partial: number; failed: number; toolErrors: number; requests: number;
  decodeCoverage: number; visibleCoverage: number; minDecodeTps: number | null;
  maxFirstVisibleMs: number | null; meets100Tps: boolean | null;
};
export type WorkloadFit = {version: 'tokfire-fit-v1'; grade: FitGrade; maxSmoothJobs: number | null; levels: FitLevel[]};

// Assess each tested level independently. Never extrapolate capacity, merge reports,
// replace per-request timing with aggregate throughput, or grade client hardware as server hardware.
export function assessWorkloadFit(report: WorkloadReport): WorkloadFit {
  const agent = isAgentWorkload(report.settings.workload);
  const attributable = report.settings.hardwareRole === 'inference-host' && report.settings.inferenceLocation === 'same-device';
  const knownProfile = report.settings.workloadSha256 === WORKLOAD_FINGERPRINTS[report.settings.workload];
  const levels = report.settings.concurrencyLevels.map(jobs => {
    const samples = report.models[0].samples.filter(s => s.concurrency === jobs);
    const requests = samples.flatMap(s => s.requests);
    const speeds = requests.flatMap(r => r.decodeTps === null ? [] : [r.decodeTps]);
    const visible = requests.flatMap(r => r.firstVisibleMs === null ? [] : [r.firstVisibleMs]);
    const complete = samples.filter(s => s.status === 'complete').length;
    const toolErrors = samples.reduce((n,s) => n + s.toolErrors, 0);
    const minDecodeTps = speeds.length ? Math.min(...speeds) : null;
    const maxFirstVisibleMs = visible.length ? Math.max(...visible) : null;
    const allMetrics = requests.length > 0 && speeds.length === requests.length && visible.length === requests.length;
    const reasons: FitReason[] = [];
    if (!attributable) reasons.push('remote-hardware');
    if (!knownProfile) reasons.push('unknown-profile');
    if (complete !== samples.length) reasons.push('incomplete');
    if (toolErrors) reasons.push('tool-errors');
    if (!allMetrics) reasons.push('missing-metrics');
    if (minDecodeTps !== null && minDecodeTps < 30) reasons.push('slow-decode');
    if (maxFirstVisibleMs !== null && maxFirstVisibleMs > 3000) reasons.push('slow-visible');
    const missed = reasons.some(r => ['incomplete','tool-errors','slow-decode','slow-visible'].includes(r));
    const grade: FitGrade = !attributable || !knownProfile ? 'U' : missed ? 'D' : !allMetrics ? 'U' : agent ? jobs > 1 ? 'A' : 'B' : 'C';
    return {jobs, grade, reasons: reasons.length ? reasons : ['smooth' as const], attempts: samples.length, complete,
      partial: samples.filter(s => s.status === 'partial').length,
      failed: samples.filter(s => s.status === 'failure' || s.status === 'error').length,
      toolErrors, requests: requests.length, decodeCoverage: speeds.length, visibleCoverage: visible.length,
      minDecodeTps, maxFirstVisibleMs,
      meets100Tps: !allMetrics ? null : complete === samples.length && toolErrors === 0 && minDecodeTps! >= 100 && maxFirstVisibleMs! <= 3000};
  });
  const smooth = levels.filter(l => ['A','B','C'].includes(l.grade));
  const best = smooth.at(-1);
  return {version:'tokfire-fit-v1', grade: best?.grade ?? (levels.some(l => l.grade === 'D') ? 'D' : 'U'), maxSmoothJobs: best?.jobs ?? null, levels};
}
