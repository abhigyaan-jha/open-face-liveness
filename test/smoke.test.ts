import { describe, expect, test } from 'bun:test';
import { WebVerify, defaultConfig, parseModelManifest } from '../src/index.js';

describe('web-verify scaffold', () => {
  test('resolves default config', () => {
    expect(defaultConfig.checks.face).toBe(true);
  });

  test('creates facade instance', () => {
    const verify = new WebVerify();
    expect(verify.state).toBe('idle');
  });

  test('parses empty model manifest', () => {
    expect(parseModelManifest({ version: 1, models: [] }).models).toEqual([]);
  });
});

