import { describe, expect, it, vi } from 'vitest';
import { initializeWithInferenceDelegate } from './InferenceDelegate';

describe('initializeWithInferenceDelegate', () => {
  it('uses the preferred GPU delegate when available', async () => {
    const initialize = vi.fn(async (delegate: 'CPU' | 'GPU') => delegate);

    await expect(
      initializeWithInferenceDelegate('GPU', initialize),
    ).resolves.toEqual({ instance: 'GPU', delegate: 'GPU' });
    expect(initialize).toHaveBeenCalledOnce();
  });

  it('falls back to CPU when GPU initialization fails', async () => {
    const initialize = vi.fn(async (delegate: 'CPU' | 'GPU') => {
      if (delegate === 'GPU') throw new Error('GPU unavailable');
      return 'cpu detector';
    });

    await expect(
      initializeWithInferenceDelegate('GPU', initialize),
    ).resolves.toEqual({ instance: 'cpu detector', delegate: 'CPU' });
    expect(initialize.mock.calls.map(([delegate]) => delegate)).toEqual([
      'GPU',
      'CPU',
    ]);
  });

  it('does not retry an explicitly requested CPU delegate', async () => {
    const initialize = vi.fn(async () => {
      throw new Error('CPU unavailable');
    });

    await expect(
      initializeWithInferenceDelegate('CPU', initialize),
    ).rejects.toThrow('CPU unavailable');
    expect(initialize).toHaveBeenCalledOnce();
  });
});
