import { describe, expect, it } from 'vitest';
import { REPORTING_HOST, reportingEnabled } from '../../src/shell/reporting.ts';

/**
 * The funnel this guards is what the experiment's verdict is read off. A test
 * play that counts is not a broken test — it is a wrong PROMOTE.
 */
const at = (hostname: string, search = '') => reportingEnabled({ hostname, search });

describe('reportingEnabled', () => {
  it('reports from the hub', () => {
    expect(at(REPORTING_HOST)).toBe(true);
  });

  it('stays silent everywhere else — dev server, preview deployments, tests', () => {
    expect(at('localhost')).toBe(false);
    expect(at('127.0.0.1')).toBe(false);
    expect(at('192.168.1.14')).toBe(false); // npm run dev -- --host, on the phone
    expect(at('play-lab.vercel.app')).toBe(false);
    expect(at('play-git-main-stas-projects-c10e6ae6.vercel.app')).toBe(false);
  });

  it('is not fooled by a hostname that merely contains the hub', () => {
    expect(at('play.hrytsko.com.example.net')).toBe(false);
    expect(at('notplay.hrytsko.com')).toBe(false);
  });

  it('?signals=on turns it on anywhere — the E2E suite asserts real calls', () => {
    expect(at('127.0.0.1', '?signals=on')).toBe(true);
    expect(at('play-lab.vercel.app', '?signals=on&utm_source=x')).toBe(true);
  });

  it('?signals=off silences a play on the hub that must not count', () => {
    expect(at(REPORTING_HOST, '?signals=off')).toBe(false);
  });
});
