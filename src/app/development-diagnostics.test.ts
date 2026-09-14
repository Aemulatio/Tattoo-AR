import { describe, expect, it } from 'vitest';
import { developmentDiagnosticsEnabled } from './development-diagnostics';

describe('developmentDiagnosticsEnabled', () => {
  it('requires both a development build and the debug query flag', () => {
    expect(developmentDiagnosticsEnabled(true, '?debug=1')).toBe(true);
    expect(developmentDiagnosticsEnabled(true, '?debug')).toBe(true);
    expect(developmentDiagnosticsEnabled(true, '')).toBe(false);
  });

  it('cannot be enabled through a production URL', () => {
    expect(developmentDiagnosticsEnabled(false, '?debug=1')).toBe(false);
  });
});
