import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ViewportTransform } from '../ar-engine/camera/ViewportTransform';
import { startFrameScheduler } from '../ar-engine/camera/frame-scheduler';
import { PoseDebugRenderer } from '../ar-engine/rendering/PoseDebugRenderer';
import { ARRenderer } from '../ar-engine/rendering/ARRenderer';
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
import type { BodySide, TattooAnchor } from '../ar-engine/contracts';
import {
  ForearmFrameEstimator,
  type ForearmLocalFrame,
} from '../ar-engine/surfaces/forearm/ForearmFrameEstimator';
import { ForearmGeometry } from '../ar-engine/surfaces/forearm/ForearmGeometry';
import {
  ForearmRadiusEstimator,
  type ForearmRadiusEstimate,
} from '../ar-engine/surfaces/forearm/ForearmRadiusEstimator';
import {
  constrainTattooAnchorToSurface,
  createTattooAnchor,
} from '../ar-engine/tattoo/TattooAnchor';
import {
  TattooAssetLoader,
  TattooAssetLoadSupersededError,
  type TattooAsset,
} from '../ar-engine/tattoo/TattooAssetLoader';
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
  const tattooCanvasRef = useRef<HTMLCanvasElement>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const trackerRef = useRef<FallbackPoseTracker | null>(null);
  const stabilizerRef = useRef(new PoseStabilizer({ selectedSide: 'left' }));
  const forearmEstimatorRef = useRef(new ForearmFrameEstimator());
  const forearmFrameRef = useRef<ForearmLocalFrame | null>(null);
  const radiusEstimatorRef = useRef(new ForearmRadiusEstimator());
  const radiusEstimateRef = useRef<ForearmRadiusEstimate | null>(null);
  const feasibilityMonitorRef = useRef(new ForearmFeasibilityMonitor());
  const arRendererRef = useRef<ARRenderer | null>(null);
  const viewportTransformRef = useRef<ViewportTransform | null>(null);
  const tattooAnchorRef = useRef<TattooAnchor | null>(null);
  const tattooAssetRef = useRef<TattooAsset | null>(null);
  const canPlaceTattooRef = useRef(false);
  const bodySideRef = useRef<BodySide>('left');
  const isMirroredRef = useRef(false);
  const metricsRef = useRef(new TrackingMetrics());
  const telemetryHistoryRef = useRef(new TelemetryHistory());
  const telemetryRendererRef = useRef<TelemetryGraphRenderer | null>(null);
  const lastMetricsUiRef = useRef(0);
  const [session, setSession] = useState<SessionState>('idle');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [bodySide, setBodySide] = useState<BodySide>('left');
  const [isMirrored, setIsMirrored] = useState(false);
  const [message, setMessage] = useState(initialError);
  const [trackerMessage, setTrackerMessage] = useState('Tracker idle');
  const [tattooMessage, setTattooMessage] = useState(
    'Start the camera, then tap the tracked forearm to place the fixture.',
  );
  const [tattooAnchor, setTattooAnchor] = useState<TattooAnchor | null>(null);
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

  const placeTattoo = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      if (!canPlaceTattooRef.current) {
        setTattooMessage('Hold the forearm steady until tracking is stable.');
        return;
      }
      const renderer = arRendererRef.current;
      const transform = viewportTransformRef.current;
      const asset = tattooAssetRef.current;
      if (!renderer || !transform || !asset) {
        setTattooMessage('Tattoo renderer is still loading.');
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const hit = renderer.hitTest(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        transform,
      );
      if (!hit) {
        setTattooMessage(
          'No visible forearm surface there. Try its front side.',
        );
        return;
      }

      const height = 0.3;
      const placement = constrainTattooAnchorToSurface(
        createTattooAnchor({
          region: hit.region,
          u: hit.uv.x,
          v: hit.uv.y,
          width: Math.min(0.3, height * asset.aspectRatio),
          height,
          rotation: 0,
        }),
      );
      const { anchor } = placement;
      tattooAnchorRef.current = anchor;
      renderer.setAnchor(anchor);
      setTattooAnchor(anchor);
      setTattooMessage(
        placement.boundaryClamped
          ? 'Fixture anchored and clamped inside the forearm boundary.'
          : 'Fixture anchored in forearm UV space.',
      );
    },
    [],
  );

  const clearTattoo = useCallback(() => {
    tattooAnchorRef.current = null;
    arRendererRef.current?.setAnchor(null);
    setTattooAnchor(null);
    setTattooMessage('Placement cleared. Tap the forearm to place it again.');
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    canPlaceTattooRef.current = false;
    arRendererRef.current?.clearSurface();
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
      const request = cameraRequestRef.current;
      setSession('requestingCamera');
      setMessage('Waiting for camera permission…');
      let acquiredStream: MediaStream | null = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: requestedFacingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        acquiredStream = stream;
        if (request !== cameraRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (request !== cameraRequestRef.current) return;
        setSession('previewing');
        setMessage('Camera ready. Loading pose tracker…');
      } catch (error) {
        acquiredStream?.getTracks().forEach((track) => track.stop());
        if (streamRef.current === acquiredStream) {
          streamRef.current = null;
          if (videoRef.current?.srcObject === acquiredStream) {
            videoRef.current.srcObject = null;
          }
        }
        if (request !== cameraRequestRef.current) return;
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
    isMirroredRef.current = nextFacingMode === 'user';
    setIsMirrored(nextFacingMode === 'user');
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
    canPlaceTattooRef.current = false;
    arRendererRef.current?.clearSurface();
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
    const tattooCanvas = tattooCanvasRef.current;
    if (session !== 'previewing' || !video || !canvas || !tattooCanvas) return;
    const tracker =
      trackerRef.current ??
      new FallbackPoseTracker(
        typeof Worker === 'undefined' ? null : () => new WorkerPoseTracker(),
        () => new MainThreadPoseTracker(),
      );
    trackerRef.current = tracker;
    const poseRenderer = new PoseDebugRenderer(canvas);
    const forearmGeometry = new ForearmGeometry();
    let arRenderer: ARRenderer;
    try {
      arRenderer = new ARRenderer(tattooCanvas, forearmGeometry, {
        onRender: (timestampMs) => metricsRef.current.recordRender(timestampMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      queueMicrotask(() => {
        setTrackerMessage(`Renderer failed: ${detail}`);
        setMessage(`Could not start WebGL rendering (${detail}).`);
        setSession('error');
      });
      forearmGeometry.dispose();
      return;
    }
    const tattooLoader = new TattooAssetLoader();
    let stopFrames: () => void = () => {};
    let unsubscribe: () => void = () => {};
    let cancelled = false;
    let initialized = false;
    arRendererRef.current = arRenderer;
    arRenderer.setAnchor(tattooAnchorRef.current);
    if (!document.hidden) arRenderer.start();
    void tattooLoader
      .replace(
        `${import.meta.env.BASE_URL}test-fixtures/botanical-crescent.png`,
      )
      .then((asset) => {
        if (cancelled) return;
        tattooAssetRef.current = asset;
        arRenderer.setTattoo(asset);
        setTattooMessage('Fixture ready. Tap the tracked forearm to place it.');
      })
      .catch((error: unknown) => {
        if (cancelled || error instanceof TattooAssetLoadSupersededError)
          return;
        const detail = error instanceof Error ? error.message : 'unknown error';
        setTattooMessage(`Could not load tattoo fixture (${detail}).`);
      });
    const startScheduling = () => {
      stopFrames();
      if (!cancelled && !document.hidden) {
        stopFrames = startFrameScheduler(video, tracker, {
          onFrameDropped: () => metricsRef.current.recordDrop(),
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        canPlaceTattooRef.current = false;
        stopFrames();
        arRenderer.pause();
      } else {
        arRenderer.start();
        if (initialized) startScheduling();
      }
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
          canPlaceTattooRef.current = false;
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
            viewportTransformRef.current = transform;
            arRenderer.resize(
              rect.width,
              rect.height,
              window.devicePixelRatio || 1,
            );
            if (forearmFrameRef.current && radiusEstimateRef.current) {
              arRenderer.updateSurface({
                poseFrame: stabilized.frame,
                side: bodySideRef.current,
                localFrame: forearmFrameRef.current,
                radii: radiusEstimateRef.current.radii,
                transform,
                sourceSize: {
                  width: video.videoWidth,
                  height: video.videoHeight,
                },
                opacity: stabilized.opacity,
              });
              canPlaceTattooRef.current = stabilized.state === 'tracking';
            } else {
              arRenderer.clearSurface();
            }
            poseRenderer.draw(
              stabilized.frame,
              transform,
              {
                width: video.videoWidth,
                height: video.videoHeight,
              },
              stabilized.opacity,
            );
            if (debug && forearmFrameRef.current) {
              poseRenderer.drawForearmWireframe(
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
              poseRenderer.drawForearmFrame(
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
            poseRenderer.clear();
            arRenderer.clearSurface();
          }
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
        canPlaceTattooRef.current = false;
        arRenderer.clearSurface();
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
      poseRenderer.clear();
      tattooLoader.dispose();
      arRenderer.dispose();
      canPlaceTattooRef.current = false;
      if (arRendererRef.current === arRenderer) arRendererRef.current = null;
      tattooAssetRef.current = null;
      viewportTransformRef.current = null;
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

    const syncViewport = () => {
      const rect = video.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return null;
      }
      const transform = new ViewportTransform({
        source: { width: video.videoWidth, height: video.videoHeight },
        display: { width: rect.width, height: rect.height },
        fit: 'cover',
        mirrored: isMirrored,
      });
      viewportTransformRef.current = transform;
      arRendererRef.current?.resize(
        rect.width,
        rect.height,
        window.devicePixelRatio || 1,
      );
      arRendererRef.current?.updateViewport(transform, {
        width: video.videoWidth,
        height: video.videoHeight,
      });
      return { rect, transform };
    };

    const drawGrid = () => {
      const viewport = syncViewport();
      if (!viewport) return;
      const { rect } = viewport;
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
      const viewport = syncViewport();
      if (!viewport) return;
      const { rect, transform } = viewport;
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
    drawGrid();
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
          ref={tattooCanvasRef}
          className="tattoo-overlay"
          aria-label="Tap the visible forearm to place the tattoo fixture"
          onPointerDown={placeTattoo}
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
        <p className="eyebrow">Phase 4 · body-local ink lab</p>
        <h1>Ink, held in place.</h1>
        <p className="lede">
          Tap the visible forearm to pin the transparent fixture to its curved
          surface. Its anchor stays in body coordinates—not screen pixels.
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
        <div className="placement-panel" aria-live="polite">
          <span>Tattoo fixture</span>
          <p>{tattooMessage}</p>
          {tattooAnchor && (
            <code>
              {tattooAnchor.region} · u {tattooAnchor.u.toFixed(3)} · v{' '}
              {tattooAnchor.v.toFixed(3)}
            </code>
          )}
          <button type="button" onClick={clearTattoo} disabled={!tattooAnchor}>
            Clear placement
          </button>
        </div>
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
