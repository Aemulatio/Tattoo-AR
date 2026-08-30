export type SessionState = 'idle' | 'requestingCamera' | 'previewing' | 'error';

export interface CapabilityReport {
  worker: boolean;
  webgl2: boolean;
  requestVideoFrameCallback: boolean;
  imageBitmap: boolean;
  videoFrame: boolean;
  mediaDevices: boolean;
  supportedConstraints: string[];
}

export function getCapabilityReport(): CapabilityReport {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const constraints = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};

  return {
    worker: typeof Worker !== 'undefined',
    webgl2: canvas.getContext('webgl2') !== null,
    requestVideoFrameCallback: 'requestVideoFrameCallback' in video,
    imageBitmap: typeof createImageBitmap === 'function',
    videoFrame: typeof VideoFrame !== 'undefined',
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    supportedConstraints: Object.entries(constraints)
      .filter(([, supported]) => supported)
      .map(([name]) => name)
      .sort(),
  };
}
