import type { InferenceDelegate } from '../contracts';

export interface InferenceDelegateSelection<T> {
  instance: T;
  delegate: InferenceDelegate;
}

export async function initializeWithInferenceDelegate<T>(
  preferredDelegate: InferenceDelegate,
  initialize: (delegate: InferenceDelegate) => Promise<T>,
): Promise<InferenceDelegateSelection<T>> {
  try {
    return {
      instance: await initialize(preferredDelegate),
      delegate: preferredDelegate,
    };
  } catch (preferredError) {
    if (preferredDelegate === 'CPU') throw preferredError;
    try {
      return { instance: await initialize('CPU'), delegate: 'CPU' };
    } catch (fallbackError) {
      throw new Error(
        `GPU delegate failed (${errorMessage(preferredError)}); CPU fallback failed (${errorMessage(fallbackError)})`,
        { cause: fallbackError },
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
