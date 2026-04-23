import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { config } from '../utils/env.js';

describe('env.config', () => {
  let tmp: string;
  const envKeys = ['_AXONSDK_TEST_KEY', '_AXONSDK_TEST_QUOTED', '_AXONSDK_TEST_MISSING'];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'axon-cli-env-'));
    for (const k of envKeys) delete process.env[k];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    for (const k of envKeys) delete process.env[k];
  });

  it('loads KEY=VALUE pairs into process.env', () => {
    writeFileSync(join(tmp, '.env'), '_AXONSDK_TEST_KEY=hello\n');
    config(tmp);
    expect(process.env._AXONSDK_TEST_KEY).toBe('hello');
  });

  it('strips surrounding quotes from values', () => {
    writeFileSync(join(tmp, '.env'), '_AXONSDK_TEST_QUOTED="a b c"\n');
    config(tmp);
    expect(process.env._AXONSDK_TEST_QUOTED).toBe('a b c');
  });

  it('is a no-op when .env does not exist', () => {
    config(tmp);
    expect(process.env._AXONSDK_TEST_MISSING).toBeUndefined();
  });

  it('does not override already-set vars', () => {
    process.env._AXONSDK_TEST_KEY = 'preexisting';
    writeFileSync(join(tmp, '.env'), '_AXONSDK_TEST_KEY=from-file\n');
    config(tmp);
    expect(process.env._AXONSDK_TEST_KEY).toBe('preexisting');
  });

  it('ignores comments and blank lines', () => {
    writeFileSync(
      join(tmp, '.env'),
      '# a comment\n\n_AXONSDK_TEST_KEY=real-value\n# another comment\n',
    );
    config(tmp);
    expect(process.env._AXONSDK_TEST_KEY).toBe('real-value');
  });
});
