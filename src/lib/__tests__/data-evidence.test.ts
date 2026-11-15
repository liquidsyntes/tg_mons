import { describe, expect, it } from 'vitest';
import { describeSample } from '../data-evidence';
import { runFraudAudit } from '../fraudDetector';

describe('data sufficiency', () => {
  it('keeps missing and invalid dates out of the sample', () => {
    const evidence = describeSample('test', [null, 'invalid', '2026-11-01'], 10);
    expect(evidence.status).toBe('partial');
    expect(evidence.sampleSize).toBe(1);
    expect(describeSample('test', [], 10).status).toBe('insufficient');
  });
  it('does not treat saved signals as evidence of current coverage', () => {
    const audit = runFraudAudit({ currentMembers: 1000, posts: [], fraudSignals: [{ signalType: 'night_bot_activity', value: 0.5, reason: 'Saved' }] });
    expect(audit.fraudScore).toBeGreaterThan(0);
    expect(audit.coverage?.status).toBe('insufficient');
    expect(audit.coverage?.evaluatedChecks).toBe(0);
  });
  it('distinguishes partial coverage from no detected signals', () => {
    const audit = runFraudAudit({ currentMembers: 1000, posts: Array.from({length: 5}, () => ({ views: 200 })) });
    expect(audit.fraudScore).toBe(0);
    expect(audit.coverage?.status).toBe('partial');
    expect(audit.coverage?.checks.find(c => c.name === 'Охват к аудитории')?.evaluated).toBe(true);
  });
});
