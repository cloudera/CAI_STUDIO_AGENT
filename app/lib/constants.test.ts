/**
 * @jest-environment jsdom
 */
import { MODEL_IDENTIFIER_OPTIONS, DEFAULT_GENERATION_CONFIG } from './constants';

describe('constants (Bedrock support)', () => {
  it('does not include BEDROCK in MODEL_IDENTIFIER_OPTIONS (loaded at runtime)', () => {
    expect(Object.keys(MODEL_IDENTIFIER_OPTIONS)).not.toContain('BEDROCK');
  });

  it('exposes sane defaults for generation config', () => {
    expect(DEFAULT_GENERATION_CONFIG).toHaveProperty('max_new_tokens');
    expect(DEFAULT_GENERATION_CONFIG).toHaveProperty('temperature');
    expect(typeof DEFAULT_GENERATION_CONFIG.max_new_tokens).toBe('number');
    expect(typeof DEFAULT_GENERATION_CONFIG.temperature).toBe('number');
  });
});
