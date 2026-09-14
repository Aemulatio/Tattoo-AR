export type SessionFailureKind =
  'compatibility' | 'camera' | 'renderer' | 'tracker';

export interface SessionFailure {
  kind: SessionFailureKind;
  category: string;
  title: string;
  guidance: string;
  technicalDetail: string | null;
  retryLabel: string;
}

export function createSessionFailure(
  kind: SessionFailureKind,
  error?: unknown,
): SessionFailure {
  if (kind === 'compatibility') {
    return {
      kind,
      category: 'Compatibility',
      title: 'Camera access is unavailable',
      guidance:
        'Open this page in a current browser over HTTPS or localhost, then check again.',
      technicalDetail: null,
      retryLabel: 'Check again',
    };
  }

  if (kind === 'camera') return cameraFailure(error);

  if (kind === 'renderer') {
    return {
      kind,
      category: 'Rendering',
      title: 'The AR renderer could not start',
      guidance:
        'Close other graphics-heavy tabs if needed, then retry this session. Your artwork is preserved.',
      technicalDetail: compactErrorDetail(error),
      retryLabel: 'Retry session',
    };
  }

  return trackerFailure(error);
}

function trackerFailure(error: unknown): SessionFailure {
  const detail = compactErrorDetail(error);
  if (
    detail?.includes('Pose worker failed to load') ||
    detail?.includes('[object Event]') ||
    detail?.includes('Browser resource load failed')
  ) {
    return {
      kind: 'tracker',
      category: 'Tracking',
      title: 'Pose tracking files could not load',
      guidance:
        'Check your connection and disable content blocking for this site, then retry. Your artwork is preserved.',
      technicalDetail:
        'The pose model or WebAssembly runtime was unavailable to the browser.',
      retryLabel: 'Retry tracking',
    };
  }

  return {
    kind: 'tracker',
    category: 'Tracking',
    title: 'Pose tracking could not start',
    guidance:
      'The on-device pose model did not initialize. Check the connection once, then retry this session.',
    technicalDetail: detail,
    retryLabel: 'Retry session',
  };
}

function cameraFailure(error: unknown): SessionFailure {
  const name = errorName(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'camera',
      category: 'Camera',
      title: 'Camera permission is blocked',
      guidance:
        'Allow camera access in the browser or site settings, then retry. Your artwork is preserved.',
      technicalDetail: name,
      retryLabel: 'Retry camera',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      kind: 'camera',
      category: 'Camera',
      title: 'No matching camera was found',
      guidance:
        'Connect or enable a camera, then retry. You can also switch between rear and selfie cameras.',
      technicalDetail: name,
      retryLabel: 'Retry camera',
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      kind: 'camera',
      category: 'Camera',
      title: 'The camera is busy',
      guidance:
        'Close other apps or tabs using the camera, then retry. Your artwork is preserved.',
      technicalDetail: name,
      retryLabel: 'Retry camera',
    };
  }
  return {
    kind: 'camera',
    category: 'Camera',
    title: 'The camera could not start',
    guidance:
      'Check camera permission and device availability, then retry without reloading the page.',
    technicalDetail: compactErrorDetail(error),
    retryLabel: 'Retry camera',
  };
}

function errorName(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name;
  }
  return null;
}

function compactErrorDetail(error: unknown): string | null {
  const detail =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'string'
        ? error
        : null;
  if (!detail) return null;
  const compact = detail.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}…`;
}
