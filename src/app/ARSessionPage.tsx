import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewportTransform } from '../ar-engine/camera/ViewportTransform';
import { startFrameScheduler } from '../ar-engine/camera/frame-scheduler';
import { PoseDebugRenderer } from '../ar-engine/rendering/PoseDebugRenderer';
import { syncCanvasSize } from '../ar-engine/rendering/syncCanvasSize';
import { MainThreadPoseTracker } from '../ar-engine/tracking/MainThreadPoseTracker';
import { WorkerPoseTracker } from '../ar-engine/tracking/WorkerPoseTracker';
import { FallbackPoseTracker } from '../ar-engine/tracking/FallbackPoseTracker';
import { PoseStabilizer } from '../ar-engine/tracking/PoseStabilizer';
import { TelemetryGraphRenderer } from '../ar-engine/diagnostics/TelemetryGraphRenderer';
import { TelemetryHistory } from '../ar-engine/diagnostics/TelemetryHistory';
import {
  TrackingMetrics,
  type TrackingMetricsSnapshot,
} from '../ar-engine/diagnostics/TrackingMetrics';
import {
  emptyForearmFeasibilitySnapshot,
  ForearmFeasibilityMonitor,
} from '../ar-engine/diagnostics/ForearmFeasibilityMonitor';
import type { BodySide } from '../ar-engine/contracts';
import {
  ForearmFrameEstimator,
  type ForearmLocalFrame,
} from '../ar-engine/surfaces/forearm/ForearmFrameEstimator';
import { ForearmGeometry } from '../ar-engine/surfaces/forearm/ForearmGeometry';
import {
  ForearmRadiusEstimator,
  type ForearmRadiusEstimate,
} from '../ar-engine/surfaces/forearm/ForearmRadiusEstimator';
import { getCapabilityReport, type SessionState } from './session-state';

type FacingMode = 'user' | 'environment';

const initialError =
  'Camera access is requested only after you choose Start camera.';
const initialDiagnosticsSnapshot: TrackingMetricsSnapshot = {
  inferenceMs: 0,
  resultsPerSecond: 0,
  rendersPerSecond: 0,
  droppedFrames: 0,
  confidence: 0,
  poseAgeMs: 0,
  trackingState: 'acquiring',
};

export function ARSessionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FallbackPoseTracker | null>(null);
  const stabilizerRef = useRef(new PoseStabilizer({ selectedSide: 'left' }));
  const forearmEstimatorRef = useRef(new ForearmFrameEstimator());
  const forearmFrameRef = useRef<ForearmLocalFrame | null>(null);
  const radiusEstimatorRef = useRef(new ForearmRadiusEstimator());
  const radiusEstimateRef = useRef<ForearmRadiusEstimate | null>(null);
  const feasibilityMonitorRef = useRef(new ForearmFeasibilityMonitor());
  const bodySideRef = useRef<BodySide>('left');
  const isMirroredRef = useRef(true);
  const metricsRef = useRef(new TrackingMetrics());
  const telemetryHistoryRef = useRef(new TelemetryHistory());
  const telemetryRendererRef = useRef<TelemetryGraphRenderer | null>(null);
  const lastMetricsUiRef = useRef(0);
  const [session, setSession] = useState<SessionState>('idle');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [bodySide, setBodySide] = useState<BodySide>('left');
  const [isMirrored, setIsMirrored] = useState(true);
  const [message, setMessage] = useState(initialError);
  const [trackerMessage, setTrackerMessage] = useState('Tracker idle');
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] =
    useState<TrackingMetricsSnapshot>(initialDiagnosticsSnapshot);
  const [dimensions, setDimensions] = useState({ source: '—', display: '—' });
  const [feasibilitySnapshot, setFeasibilitySnapshot] = useState(
    emptyForearmFeasibilitySnapshot,
  );
  const [forearmDiagnostics, setForearmDiagnostics] = useState({
    rollSource: '—',
    rollConfidence: 0,
    radiusSource: '—',
    radiusConfidence: 0,
    wristRadiusRatio: 0,
    elbowRadiusRatio: 0,
  });
  const debug = new URLSearchParams(window.location.search).has('debug');
  const capabilities = getCapabilityReport();

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (requestedFacingMode = facingMode) => {
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
            facingMode: { ideal: requestedFacingMode },
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
        setMessage('Camera ready. Loading pose tracker…');
      } catch (error) {
        const detail =
          error instanceof DOMException ? error.name : 'Unknown error';
        setMessage(
          `Could not start the camera (${detail}). Check permission, then try again.`,
        );
        setSession('error');
      }
    },
    [facingMode, stopCamera],
  );

  const switchCamera = useCallback(() => {
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    stabilizerRef.current.reset();
    forearmEstimatorRef.current.reset();
    forearmFrameRef.current = null;
    radiusEstimatorRef.current.reset();
    radiusEstimateRef.current = null;
    feasibilityMonitorRef.current.reset();
    metricsRef.current = new TrackingMetrics();
    telemetryHistoryRef.current.clear();
    telemetryRendererRef.current?.draw([]);
    lastMetricsUiRef.current = 0;
    setDiagnosticsSnapshot(metricsRef.current.snapshot());
    setForearmDiagnostics(initialForearmDiagnostics());
    setFeasibilitySnapshot(emptyForearmFeasibilitySnapshot());
    setFacingMode(nextFacingMode);
    setMessage('Switching camera…');
    void startCamera(nextFacingMode);
  }, [facingMode, startCamera]);

  const selectBodySide = useCallback((side: BodySide) => {
    if (bodySideRef.current === side) return;
    bodySideRef.current = side;
    stabilizerRef.current.selectSide(side);
    forearmEstimatorRef.current.reset();
    forearmFrameRef.current = null;
    radiusEstimatorRef.current.reset();
    radiusEstimateRef.current = null;
    feasibilityMonitorRef.current.reset();
    metricsRef.current = new TrackingMetrics();
    telemetryHistoryRef.current.clear();
    telemetryRendererRef.current?.draw([]);
    lastMetricsUiRef.current = 0;
    setDiagnosticsSnapshot(metricsRef.current.snapshot());
    setBodySide(side);
    setForearmDiagnostics(initialForearmDiagnostics());
    setFeasibilitySnapshot(emptyForearmFeasibilitySnapshot());
    setTrackerMessage(`Acquiring ${side} forearm…`);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = poseCanvasRef.current;
    if (session !== 'previewing' || !video || !canvas) return;
    const tracker =
      trackerRef.current ??
      new FallbackPoseTracker(
        typeof Worker === 'undefined' ? null : () => new WorkerPoseTracker(),
        () => new MainThreadPoseTracker(),
      );
    trackerRef.current = tracker;
    const renderer = new PoseDebugRenderer(canvas);
    const forearmGeometry = new ForearmGeometry();
    let stopFrames: () => void = () => {};
    let unsubscribe: () => void = () => {};
    let cancelled = false;
    let initialized = false;
    const startScheduling = () => {
      stopFrames();
      if (!cancelled && !document.hidden) {
        stopFrames = startFrameScheduler(video, tracker, {
          onFrameDropped: () => metricsRef.current.recordDrop(),
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopFrames();
      else if (initialized) startScheduling();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void tracker
      .initialize({
        // A runtime URL prevents Vite from treating MediaPipe's dynamic WASM
        // loader import as a source-module import from /public.
        wasmRoot: new URL(
          `${import.meta.env.BASE_URL}wasm/`,
          window.location.origin,
        ).href,
        modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`,
      })
      .then(() => {
        if (cancelled) return;
        initialized = true;
        const trackerMode =
          tracker.executionMode === 'worker'
            ? 'worker'
            : 'main-thread fallback';
        setTrackerMessage(`Pose tracker active (${trackerMode})`);
        unsubscribe = tracker.subscribe((frame) => {
          const nowMs = performance.now();
          const stabilized = stabilizerRef.current.process(frame, nowMs);
          metricsRef.current.recordResult(frame, nowMs);
          metricsRef.current.recordTracking(
            stabilized.confidence.value,
            stabilized.confidence.poseAgeMs,
            stabilized.state,
          );
          const rect = video.getBoundingClientRect();
          syncCanvasSize(canvas, rect.width, rect.height);
          if (stabilized.frame && stabilized.opacity > 0) {
            if (stabilized.state !== 'trackingLost') {
              forearmFrameRef.current = forearmEstimatorRef.current.update(
                stabilized.frame,
                bodySideRef.current,
              );
              if (forearmFrameRef.current) {
                radiusEstimateRef.current = radiusEstimatorRef.current.update(
                  stabilized.frame.forearmMaskSamples?.[bodySideRef.current],
                  forearmFrameRef.current.length,
                  stabilized.frame.timestampMs,
                );
                feasibilityMonitorRef.current.record(
                  stabilized.frame.timestampMs,
                  forearmFrameRef.current,
                  radiusEstimateRef.current,
                );
                forearmGeometry.update(
                  forearmFrameRef.current,
                  radiusEstimateRef.current.radii,
                );
              }
            }
            const transform = new ViewportTransform({
              source: { width: video.videoWidth, height: video.videoHeight },
              display: { width: rect.width, height: rect.height },
              fit: 'cover',
              mirrored: isMirroredRef.current,
            });
            renderer.draw(
              stabilized.frame,
              transform,
              {
                width: video.videoWidth,
                height: video.videoHeight,
              },
              stabilized.opacity,
            );
            if (debug && forearmFrameRef.current) {
              renderer.drawForearmWireframe(
                stabilized.frame,
                bodySideRef.current,
                forearmFrameRef.current,
                forearmGeometry,
                transform,
                {
                  width: video.videoWidth,
                  height: video.videoHeight,
                },
                stabilized.opacity,
              );
              renderer.drawForearmFrame(
                stabilized.frame,
                bodySideRef.current,
                forearmFrameRef.current,
                transform,
                {
                  width: video.videoWidth,
                  height: video.videoHeight,
                },
                stabilized.opacity,
              );
            }
          } else {
            renderer.clear();
          }
          metricsRef.current.recordRender(nowMs);
          const metrics = metricsRef.current.snapshot();
          if (nowMs - lastMetricsUiRef.current >= 1000) {
            lastMetricsUiRef.current = nowMs;
            setDiagnosticsSnapshot(metrics);
            setForearmDiagnostics({
              rollSource: forearmFrameRef.current?.orientationSource ?? '—',
              rollConfidence: forearmFrameRef.current?.rollConfidence ?? 0,
              radiusSource: radiusEstimateRef.current?.source ?? '—',
              radiusConfidence: radiusEstimateRef.current?.confidence ?? 0,
              wristRadiusRatio:
                radiusEstimateRef.current?.wristRadiusRatio ?? 0,
              elbowRadiusRatio:
                radiusEstimateRef.current?.elbowRadiusRatio ?? 0,
            });
            setFeasibilitySnapshot(
              feasibilityMonitorRef.current.snapshot(nowMs),
            );
            telemetryHistoryRef.current.push(nowMs, metrics);
            const telemetryCanvas = telemetryCanvasRef.current;
            if (telemetryCanvas) {
              telemetryRendererRef.current ??= new TelemetryGraphRenderer(
                telemetryCanvas,
              );
              telemetryRendererRef.current.draw(
                telemetryHistoryRef.current.samples(),
              );
            }
            const side = stabilized.confidence.side ?? 'no arm';
            setTrackerMessage(
              `${stabilized.state} · ${side} · ${Math.round(metrics.confidence * 100)}% · ${metrics.resultsPerSecond.toFixed(1)} FPS · ${metrics.inferenceMs.toFixed(0)} ms · ${trackerMode}`,
            );
          }
        });
        startScheduling();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (trackerRef.current === tracker) trackerRef.current = null;
        void tracker.dispose();
        const detail = error instanceof Error ? error.message : 'unknown error';
        setTrackerMessage(`Tracker failed: ${detail}`);
        setMessage(`Could not load pose tracking (${detail}). Try again.`);
        setSession('error');
      });
    return () => {
      cancelled = true;
      stopFrames();
      unsubscribe();
      renderer.clear();
      forearmGeometry.dispose();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [debug, session]);

  useEffect(
    () => () => {
      void trackerRef.current?.dispose();
      trackerRef.current = null;
    },
    [],
  );

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
    const onLoadedMetadata = () => {
      const rect = video.getBoundingClientRect();
      const transform = new ViewportTransform({
        source: { width: video.videoWidth, height: video.videoHeight },
        display: { width: rect.width, height: rect.height },
        fit: 'cover',
        mirrored: isMirrored,
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
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      resize.disconnect();
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [isMirrored]);

  return (
    <main className="ar-shell">
      <section className="camera-stage" aria-label="Live camera preview">
        <video
          ref={videoRef}
          className={`camera-feed ${isMirrored ? 'is-mirrored' : ''}`}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className={`debug-grid ${debug ? 'is-visible' : ''}`}
          aria-hidden="true"
        />
        <canvas
          ref={poseCanvasRef}
          className="pose-overlay"
          aria-hidden="true"
        />
        <div className="camera-chrome">
          <span>LIVE / FOREARM POC</span>
          <span className={`status-dot ${session}`} /> {session}
          <span>{trackerMessage}</span>
        </div>
        {session !== 'previewing' && (
          <div className="stage-message">{message}</div>
        )}
      </section>

      <section className="control-panel" aria-label="Camera controls">
        <p className="eyebrow">Phase 3 · forearm surface lab</p>
        <h1>Ink, held in place.</h1>
        <p className="lede">
          A privacy-first live preview. The tapered surface, stable seam, and
          roll evidence run entirely on this device.
        </p>
        <fieldset className="arm-selector">
          <legend>Target forearm</legend>
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={bodySide === side}
              onClick={() => selectBodySide(side)}
            >
              <span>{side === 'left' ? 'L' : 'R'}</span>
              {side}
            </button>
          ))}
        </fieldset>
        <div className="controls">
          <button
            className="primary"
            type="button"
            onClick={() => void startCamera()}
            disabled={session === 'requestingCamera'}
          >
            {session === 'requestingCamera' ? 'Connecting…' : 'Start camera'}
          </button>
          <button className="secondary" type="button" onClick={switchCamera}>
            Use {facingMode === 'user' ? 'rear' : 'selfie'} camera
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => setIsMirrored((mirrored) => !mirrored)}
          >
            {isMirrored ? 'Unmirror preview' : 'Mirror preview'}
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
            <div className="telemetry-readout">
              <span>
                <small>STATE</small>
                <b data-state={diagnosticsSnapshot.trackingState}>
                  {diagnosticsSnapshot.trackingState}
                </b>
              </span>
              <span>
                <small>CONF</small>
                <b>{Math.round(diagnosticsSnapshot.confidence * 100)}%</b>
              </span>
              <span>
                <small>POSE AGE</small>
                <b>{diagnosticsSnapshot.poseAgeMs.toFixed(0)} ms</b>
              </span>
              <span>
                <small>DROPS</small>
                <b>{diagnosticsSnapshot.droppedFrames}</b>
              </span>
              <span>
                <small>ROLL SOURCE</small>
                <b>{forearmDiagnostics.rollSource}</b>
              </span>
              <span>
                <small>ROLL CONF</small>
                <b>{Math.round(forearmDiagnostics.rollConfidence * 100)}%</b>
              </span>
              <span>
                <small>RADIUS SOURCE</small>
                <b>{forearmDiagnostics.radiusSource}</b>
              </span>
              <span>
                <small>RADIUS CONF</small>
                <b>{Math.round(forearmDiagnostics.radiusConfidence * 100)}%</b>
              </span>
              <span>
                <small>RADIUS W / E</small>
                <b>
                  {Math.round(forearmDiagnostics.wristRadiusRatio * 1000) / 10}
                  {' / '}
                  {Math.round(forearmDiagnostics.elbowRadiusRatio * 1000) / 10}%
                </b>
              </span>
              <span>
                <small>ROLL / RANGE</small>
                <b>
                  {signedDegrees(feasibilitySnapshot.currentRollDegrees)} /{' '}
                  {Math.round(feasibilitySnapshot.rollRangeDegrees)}°
                </b>
              </span>
              <span>
                <small>MAX ROLL STEP</small>
                <b>{feasibilitySnapshot.maximumRollStepDegrees.toFixed(1)}°</b>
              </span>
              <span>
                <small>180° FLIPS</small>
                <b>{feasibilitySnapshot.flipCount}</b>
              </span>
              <span>
                <small>5S RADIUS Δ W / E</small>
                <b>
                  {feasibilitySnapshot.wristRadiusDriftPercent.toFixed(1)} /{' '}
                  {feasibilitySnapshot.elbowRadiusDriftPercent.toFixed(1)}%
                </b>
              </span>
              <span>
                <small>STABILITY WINDOW</small>
                <b>
                  {(feasibilitySnapshot.radiusWindowMs / 1_000).toFixed(1)} / 5s
                </b>
              </span>
            </div>
            <canvas
              ref={telemetryCanvasRef}
              className="telemetry-graph"
              role="img"
              aria-label="Live graphs for inference time, tracking rate, render rate, and pose confidence"
            />
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

function initialForearmDiagnostics() {
  return {
    rollSource: '—',
    rollConfidence: 0,
    radiusSource: '—',
    radiusConfidence: 0,
    wristRadiusRatio: 0,
    elbowRadiusRatio: 0,
  };
}

function signedDegrees(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}
