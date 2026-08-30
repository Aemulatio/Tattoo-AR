import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewportTransform } from '../ar-engine/camera/ViewportTransform';
import { getCapabilityReport, type SessionState } from './session-state';

type FacingMode = 'user' | 'environment';

const initialError =
  'Camera access is requested only after you choose Start camera.';

export function ARSessionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [session, setSession] = useState<SessionState>('idle');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [message, setMessage] = useState(initialError);
  const [dimensions, setDimensions] = useState({ source: '—', display: '—' });
  const debug = new URLSearchParams(window.location.search).has('debug');
  const capabilities = getCapabilityReport();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        'This browser does not provide camera access. Try a current mobile browser over HTTPS.',
      );
      setSession('error');
      return;
    }

    stopCamera();
    setSession('requestingCamera');
    setMessage('Waiting for camera permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setSession('previewing');
      setMessage('Camera ready. Tracking is intentionally added in Phase 1.');
    } catch (error) {
      const detail =
        error instanceof DOMException ? error.name : 'Unknown error';
      setMessage(
        `Could not start the camera (${detail}). Check permission, then try again.`,
      );
      setSession('error');
    }
  }, [facingMode, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const drawGrid = () => {
      const rect = video.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, rect.width, rect.height);
      context.strokeStyle = 'rgba(225, 255, 72, 0.38)';
      context.lineWidth = 1;
      for (let x = 0; x <= rect.width; x += rect.width / 6) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, rect.height);
        context.stroke();
      }
      for (let y = 0; y <= rect.height; y += rect.height / 9) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(rect.width, y);
        context.stroke();
      }
      context.fillStyle = 'rgba(225, 255, 72, 0.9)';
      context.font = '12px monospace';
      context.fillText('display / renderer grid', 14, 22);
    };
    const resize = new ResizeObserver(drawGrid);
    resize.observe(video);
    video.addEventListener('loadedmetadata', () => {
      const rect = video.getBoundingClientRect();
      const transform = new ViewportTransform({
        source: { width: video.videoWidth, height: video.videoHeight },
        display: { width: rect.width, height: rect.height },
        fit: 'cover',
        mirrored: facingMode === 'user',
      });
      const center = transform.sourceToDisplay({
        x: video.videoWidth / 2,
        y: video.videoHeight / 2,
      });
      setDimensions({
        source: `${video.videoWidth} × ${video.videoHeight}`,
        display: `${Math.round(rect.width)} × ${Math.round(rect.height)} · center ${Math.round(center.x)},${Math.round(center.y)}`,
      });
      drawGrid();
    });
    return () => resize.disconnect();
  }, [facingMode]);

  return (
    <main className="ar-shell">
      <section className="camera-stage" aria-label="Live camera preview">
        <video
          ref={videoRef}
          className={`camera-feed ${facingMode === 'user' ? 'is-mirrored' : ''}`}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className={`debug-grid ${debug ? 'is-visible' : ''}`}
          aria-hidden="true"
        />
        <div className="camera-chrome">
          <span>LIVE / FOREARM POC</span>
          <span className={`status-dot ${session}`} /> {session}
        </div>
        {session !== 'previewing' && (
          <div className="stage-message">{message}</div>
        )}
      </section>

      <section className="control-panel" aria-label="Camera controls">
        <p className="eyebrow">Phase 0 · capability shell</p>
        <h1>Ink, held in place.</h1>
        <p className="lede">
          A privacy-first live preview. Video stays on this device; tracking and
          tattoo placement arrive in subsequent phases.
        </p>
        <div className="controls">
          <button
            className="primary"
            type="button"
            onClick={() => void startCamera()}
            disabled={session === 'requestingCamera'}
          >
            {session === 'requestingCamera' ? 'Connecting…' : 'Start camera'}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setFacingMode((mode) =>
                mode === 'user' ? 'environment' : 'user',
              );
              setMessage('Camera side changed. Start camera to apply it.');
              stopCamera();
              setSession('idle');
            }}
          >
            Use {facingMode === 'user' ? 'rear' : 'selfie'} camera
          </button>
        </div>
        {session === 'error' && (
          <button
            className="retry"
            type="button"
            onClick={() => void startCamera()}
          >
            Try again
          </button>
        )}
        {debug && (
          <details className="diagnostics" open>
            <summary>Development diagnostics</summary>
            <p>
              Source: {dimensions.source}
              <br />
              Display: {dimensions.display}
            </p>
            <ul>
              {Object.entries(capabilities)
                .filter(([key]) => key !== 'supportedConstraints')
                .map(([key, value]) => (
                  <li key={key}>
                    {key}: <b>{String(value)}</b>
                  </li>
                ))}
            </ul>
            <p className="constraints">
              Constraints:{' '}
              {capabilities.supportedConstraints.join(', ') || 'none reported'}
            </p>
          </details>
        )}
      </section>
    </main>
  );
}
