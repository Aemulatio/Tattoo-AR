import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ViewportTransform } from '../ar-engine/camera/ViewportTransform';
import {
  AdaptiveTrackingCadence,
  type TrackingCadenceSnapshot,
} from '../ar-engine/camera/AdaptiveTrackingCadence';
import { startFrameScheduler } from '../ar-engine/camera/frame-scheduler';
import { PoseDebugRenderer } from '../ar-engine/rendering/PoseDebugRenderer';
import { ARRenderer } from '../ar-engine/rendering/ARRenderer';
import {
  renderPixelRatioCap,
  type RenderResolutionMode,
} from '../ar-engine/rendering/RenderResolution';
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
  createTattooAnchor,
  resetTattooAnchorTransform,
  resizeTattooAnchor,
  rotateTattooAnchor,
  tattooSizeForAspectRatio,
  type TattooAnchorConstraintResult,
} from '../ar-engine/tattoo/TattooAnchor';
import {
  TattooAssetLoader,
  TattooAssetLoadSupersededError,
  type TattooAsset,
} from '../ar-engine/tattoo/TattooAssetLoader';
import {
  decodeTattooFile,
  TattooFileError,
  type DecodedTattooFile,
} from '../ar-engine/tattoo/TattooFileDecoder';
import {
  defaultTattooAppearance,
  type TattooAppearance,
} from '../ar-engine/tattoo/tattoo-shader';
import {
  TattooGestureController,
  type TattooGestureKind,
  type TattooGestureUpdate,
} from '../ar-engine/tattoo/TattooGestureController';
import { createSessionFailure, type SessionFailure } from './session-errors';
import { getCapabilityReport, type SessionState } from './session-state';

type FacingMode = 'user' | 'environment';
type ArtworkStatus = 'loading' | 'ready' | 'error';

const renderResolutionModes: readonly RenderResolutionMode[] = [
  'auto',
  'sharp',
  'efficient',
];
const renderResolutionLabels: Record<RenderResolutionMode, string> = {
  auto: 'Auto',
  sharp: 'Sharp',
  efficient: 'Efficient',
};
const initialCadenceSnapshot: TrackingCadenceSnapshot = {
  level: 'quality',
  targetFramesPerSecond: 20,
  smoothedInferenceMs: 0,
};

interface ArtworkState {
  status: ArtworkStatus;
  name: string;
  detail: string;
}

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
  const sessionErrorPanelRef = useRef<HTMLElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const restartInFlightRef = useRef(false);
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
  const tattooLoaderRef = useRef<TattooAssetLoader | null>(null);
  const tattooAppearanceRef = useRef<TattooAppearance>({
    ...defaultTattooAppearance,
  });
  const tattooVisibleRef = useRef(true);
  const tattooGestureRef = useRef<TattooGestureController | null>(null);
  const canPlaceTattooRef = useRef(false);
  const bodySideRef = useRef<BodySide>('left');
  const isMirroredRef = useRef(false);
  const metricsRef = useRef(new TrackingMetrics());
  const cadenceRef = useRef(new AdaptiveTrackingCadence());
  const renderResolutionModeRef = useRef<RenderResolutionMode>('auto');
  const telemetryHistoryRef = useRef(new TelemetryHistory());
  const telemetryRendererRef = useRef<TelemetryGraphRenderer | null>(null);
  const lastMetricsUiRef = useRef(0);
  const [session, setSession] = useState<SessionState>('idle');
  const [sessionFailure, setSessionFailure] = useState<SessionFailure | null>(
    null,
  );
  const [isRestarting, setIsRestarting] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [bodySide, setBodySide] = useState<BodySide>('left');
  const [isMirrored, setIsMirrored] = useState(false);
  const [message, setMessage] = useState(initialError);
  const [trackerMessage, setTrackerMessage] = useState('Tracker idle');
  const [tattooMessage, setTattooMessage] = useState(
    'Preparing the demo artwork. You can upload your own design now.',
  );
  const [tattooAnchor, setTattooAnchor] = useState<TattooAnchor | null>(null);
  const [hasTattooAsset, setHasTattooAsset] = useState(false);
  const [tattooVisible, setTattooVisible] = useState(true);
  const [artwork, setArtwork] = useState<ArtworkState>({
    status: 'loading',
    name: 'Demo artwork',
    detail: 'Preparing the built-in transparent PNG…',
  });
  const [tattooAppearance, setTattooAppearance] = useState<TattooAppearance>({
    ...defaultTattooAppearance,
  });
  const [cadenceSnapshot, setCadenceSnapshot] = useState(
    initialCadenceSnapshot,
  );
  const [renderResolutionMode, setRenderResolutionMode] =
    useState<RenderResolutionMode>('auto');
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
    const controller = new TattooGestureController({
      getAnchor: () => tattooAnchorRef.current,
      hitTest: (point) => {
        const renderer = arRendererRef.current;
        const transform = viewportTransformRef.current;
        return renderer && transform
          ? renderer.hitTest(point, transform)
          : null;
      },
      createAnchor: (hit) => {
        const asset = tattooAssetRef.current;
        if (!asset) return null;
        return createTattooAnchor({
          region: hit.region,
          u: hit.uv.x,
          v: hit.uv.y,
          ...tattooSizeForAspectRatio(asset.aspectRatio),
          rotation: 0,
        });
      },
      crossesSeam: (anchor) =>
        arRendererRef.current?.crossesTattooSeam(anchor) ?? false,
      isDisplayMirrored: () => isMirroredRef.current,
      onUpdate: (update) => {
        tattooAnchorRef.current = update.anchor;
        arRendererRef.current?.setAnchor(update.anchor);
        showTattooGestureFeedback(tattooCanvasRef.current, update);
      },
      onCommit: (update) => {
        tattooAnchorRef.current = update.anchor;
        arRendererRef.current?.setAnchor(update.anchor);
        setTattooAnchor(update.anchor);
        setTattooMessage(tattooGestureMessage(update));
        clearTattooGestureFeedback(tattooCanvasRef.current);
      },
    });
    tattooGestureRef.current = controller;
    return () => {
      controller.reset();
      if (tattooGestureRef.current === controller)
        tattooGestureRef.current = null;
    };
  }, []);

  useEffect(() => {
    const loader = new TattooAssetLoader();
    tattooLoaderRef.current = loader;
    let active = true;
    void loader
      .replace(
        `${import.meta.env.BASE_URL}test-fixtures/botanical-crescent.png`,
      )
      .then((asset) => {
        if (!active) return;
        tattooAssetRef.current = asset;
        arRendererRef.current?.setTattoo(asset);
        setHasTattooAsset(true);
        setArtwork({
          status: 'ready',
          name: 'Botanical crescent',
          detail: `${asset.pixelWidth} × ${asset.pixelHeight} px · demo transparent PNG`,
        });
        setTattooMessage(
          'Artwork ready. Start the camera, then tap the tracked forearm.',
        );
      })
      .catch((error: unknown) => {
        if (!active || error instanceof TattooAssetLoadSupersededError) return;
        const detail = error instanceof Error ? error.message : 'unknown error';
        setArtwork({
          status: 'error',
          name: 'Demo unavailable',
          detail: `Could not load the demo artwork (${detail}). Upload a PNG or JPEG instead.`,
        });
      });
    return () => {
      active = false;
      if (tattooLoaderRef.current === loader) tattooLoaderRef.current = null;
      if (tattooAssetRef.current === loader.current) {
        tattooAssetRef.current = null;
      }
      loader.dispose();
    };
  }, []);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    tattooAppearanceRef.current = tattooAppearance;
    arRendererRef.current?.setTattooAppearance(tattooAppearance);
  }, [tattooAppearance]);

  useEffect(() => {
    tattooVisibleRef.current = tattooVisible;
    arRendererRef.current?.setTattooVisible(tattooVisible);
  }, [tattooVisible]);

  useEffect(() => {
    if (!sessionFailure) return;
    const animationFrame = requestAnimationFrame(() => {
      sessionErrorPanelRef.current?.focus();
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [sessionFailure]);

  const handleTattooPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      if (!canPlaceTattooRef.current) {
        setTattooMessage('Hold the forearm steady until tracking is stable.');
        return;
      }
      if (
        !arRendererRef.current ||
        !viewportTransformRef.current ||
        !tattooAssetRef.current ||
        !tattooGestureRef.current
      ) {
        setTattooMessage('Tattoo renderer is still loading.');
        return;
      }
      const mode = tattooGestureRef.current.pointerDown(
        event.pointerId,
        pointerPosition(event),
      );
      if (!mode) {
        setTattooMessage(
          'No visible forearm surface there. Try its front side.',
        );
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      showTattooGestureMode(event.currentTarget, mode);
    },
    [],
  );

  const handleTattooPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const tattooGesture = tattooGestureRef.current;
      if (!tattooGesture?.hasPointer(event.pointerId)) return;
      event.preventDefault();
      const mode = tattooGesture.pointerMove(
        event.pointerId,
        pointerPosition(event),
      );
      if (mode) showTattooGestureMode(event.currentTarget, mode);
    },
    [],
  );

  const handleTattooPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const tattooGesture = tattooGestureRef.current;
      if (!tattooGesture?.hasPointer(event.pointerId)) return;
      tattooGesture.pointerMove(event.pointerId, pointerPosition(event));
      const ended = tattooGesture.pointerUp(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (ended) clearTattooGestureFeedback(event.currentTarget);
      else if (tattooGesture.mode) {
        showTattooGestureMode(event.currentTarget, tattooGesture.mode);
      }
    },
    [],
  );

  const handleTattooPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const tattooGesture = tattooGestureRef.current;
      if (!tattooGesture?.hasPointer(event.pointerId)) return;
      const pointerIds = tattooGesture.activePointerIds;
      tattooGestureRef.current?.cancel();
      for (const pointerId of pointerIds) {
        if (event.currentTarget.hasPointerCapture(pointerId)) {
          event.currentTarget.releasePointerCapture(pointerId);
        }
      }
      clearTattooGestureFeedback(event.currentTarget);
    },
    [],
  );

  const clearTattoo = useCallback(() => {
    tattooGestureRef.current?.reset();
    clearTattooGestureFeedback(tattooCanvasRef.current);
    tattooAnchorRef.current = null;
    arRendererRef.current?.setAnchor(null);
    setTattooAnchor(null);
    setTattooMessage('Placement cleared. Tap the forearm to place it again.');
  }, []);

  const commitControlledAnchor = useCallback(
    (result: TattooAnchorConstraintResult, message: string) => {
      tattooGestureRef.current?.reset();
      clearTattooGestureFeedback(tattooCanvasRef.current);
      tattooAnchorRef.current = result.anchor;
      arRendererRef.current?.setAnchor(result.anchor);
      setTattooAnchor(result.anchor);
      const seamCrossed =
        arRendererRef.current?.crossesTattooSeam(result.anchor) ?? false;
      const note = result.boundaryClamped
        ? ' Kept inside the forearm boundary.'
        : seamCrossed
          ? ' The design wraps across the forearm seam.'
          : '';
      setTattooMessage(`${message}${note}`);
    },
    [],
  );

  const setTattooVisibility = useCallback((visible: boolean) => {
    tattooVisibleRef.current = visible;
    arRendererRef.current?.setTattooVisible(visible);
    setTattooVisible(visible);
    setTattooMessage(
      visible
        ? 'Tattoo shown. Placement and adjustments were preserved.'
        : 'Tattoo hidden. Placement and adjustments are still preserved.',
    );
  }, []);

  const selectRenderResolutionMode = useCallback(
    (mode: RenderResolutionMode) => {
      renderResolutionModeRef.current = mode;
      setRenderResolutionMode(mode);
      const video = videoRef.current;
      const renderer = arRendererRef.current;
      if (!video || !renderer) return;
      const rect = video.getBoundingClientRect();
      renderer.resize(
        rect.width,
        rect.height,
        window.devicePixelRatio || 1,
        renderPixelRatioCap(mode, cadenceRef.current.level),
      );
    },
    [],
  );

  const updateTattooSize = useCallback(
    (longestDimension: number) => {
      const anchor = tattooAnchorRef.current;
      if (!anchor) return;
      commitControlledAnchor(
        resizeTattooAnchor(anchor, longestDimension),
        `Tattoo size set to ${Math.round(longestDimension * 100)}% of forearm length.`,
      );
    },
    [commitControlledAnchor],
  );

  const updateTattooRotation = useCallback(
    (rotationDegrees: number) => {
      const anchor = tattooAnchorRef.current;
      if (!anchor) return;
      commitControlledAnchor(
        rotateTattooAnchor(anchor, (rotationDegrees * Math.PI) / 180),
        `Tattoo rotation set to ${signedDegrees(rotationDegrees)}.`,
      );
    },
    [commitControlledAnchor],
  );

  const resetTattooAdjustments = useCallback(() => {
    const asset = tattooAssetRef.current;
    const resetAppearance: TattooAppearance = {
      ...defaultTattooAppearance,
      removeWhiteBackground:
        asset?.sourceUrl.startsWith('local-file:') ?? false,
    };
    tattooAppearanceRef.current = resetAppearance;
    arRendererRef.current?.setTattooAppearance(resetAppearance);
    setTattooAppearance(resetAppearance);
    tattooVisibleRef.current = true;
    arRendererRef.current?.setTattooVisible(true);
    setTattooVisible(true);

    const anchor = tattooAnchorRef.current;
    if (anchor && asset) {
      commitControlledAnchor(
        resetTattooAnchorTransform(anchor, asset.aspectRatio),
        'Size, rotation, ink strength, and visibility reset.',
      );
    } else {
      setTattooMessage(
        'Artwork adjustments reset. Tap the tracked forearm to place it.',
      );
    }
  }, [commitControlledAnchor]);

  const handleTattooFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      const loader = tattooLoaderRef.current;
      if (!loader) {
        setArtwork({
          status: 'error',
          name: file.name,
          detail:
            'The artwork loader is not ready. Try choosing the file again.',
        });
        return;
      }

      setArtwork({
        status: 'loading',
        name: file.name,
        detail: `Checking and preparing ${formatFileSize(file.size)} on this device…`,
      });
      let decoded: DecodedTattooFile | null = null;
      try {
        const asset = await loader.replaceWith(
          `local-file:${encodeURIComponent(file.name)}`,
          async () => {
            decoded = await decodeTattooFile(file);
            return decoded.resource;
          },
        );
        if (!decoded) throw new Error('Image decoding did not return metadata');

        tattooGestureRef.current?.reset();
        clearTattooGestureFeedback(tattooCanvasRef.current);
        tattooAnchorRef.current = null;
        tattooAssetRef.current = asset;
        arRendererRef.current?.setTattoo(asset);
        arRendererRef.current?.setAnchor(null);
        tattooVisibleRef.current = true;
        arRendererRef.current?.setTattooVisible(true);
        setTattooAnchor(null);
        setHasTattooAsset(true);
        setTattooVisible(true);
        setTattooAppearance((current) => ({
          ...current,
          removeWhiteBackground: true,
          invert: false,
        }));
        setArtwork({
          status: 'ready',
          name: file.name,
          detail: artworkDimensionsMessage(decoded, file.size),
        });
        setTattooMessage(
          'Your artwork is ready. Hold one forearm in frame, then tap it to place.',
        );
      } catch (error) {
        if (error instanceof TattooAssetLoadSupersededError) return;
        setArtwork({
          status: 'error',
          name: file.name,
          detail:
            error instanceof TattooFileError
              ? error.message
              : 'Could not prepare this image. Try another PNG or JPEG.',
        });
      }
    },
    [],
  );

  const stopCamera = useCallback(() => {
    tattooGestureRef.current?.reset();
    clearTattooGestureFeedback(tattooCanvasRef.current);
    cameraRequestRef.current += 1;
    canPlaceTattooRef.current = false;
    arRendererRef.current?.clearSurface();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const failSession = useCallback((failure: SessionFailure) => {
    setSessionFailure(failure);
    setMessage(failure.guidance);
    setSession('error');
  }, []);

  const startCamera = useCallback(
    async (requestedFacingMode = facingMode) => {
      setSessionFailure(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        failSession(createSessionFailure('compatibility'));
        return;
      }

      tattooGestureRef.current?.cancel();
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
        setSessionFailure(null);
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
        failSession(createSessionFailure('camera', error));
      }
    },
    [facingMode, failSession, stopCamera],
  );

  const restartSession = useCallback(async () => {
    if (restartInFlightRef.current) return;
    restartInFlightRef.current = true;
    setIsRestarting(true);
    setSessionFailure(null);
    setSession('requestingCamera');
    setMessage('Rebuilding the camera and on-device tracker…');
    stopCamera();

    const tracker = trackerRef.current;
    trackerRef.current = null;
    try {
      await tracker?.dispose();
    } catch {
      // A failed tracker is replaced below even when its cleanup reports an error.
    }
    stabilizerRef.current.reset();
    forearmEstimatorRef.current.reset();
    forearmFrameRef.current = null;
    radiusEstimatorRef.current.reset();
    radiusEstimateRef.current = null;
    feasibilityMonitorRef.current.reset();
    cadenceRef.current.reset();
    metricsRef.current = new TrackingMetrics();
    telemetryHistoryRef.current.clear();
    telemetryRendererRef.current?.draw([]);
    lastMetricsUiRef.current = 0;
    setDiagnosticsSnapshot(metricsRef.current.snapshot());
    setCadenceSnapshot(cadenceRef.current.snapshot());
    setForearmDiagnostics(initialForearmDiagnostics());
    setFeasibilitySnapshot(emptyForearmFeasibilitySnapshot());
    setTrackerMessage('Tracker restarting…');

    try {
      await startCamera(facingMode);
    } finally {
      restartInFlightRef.current = false;
      setIsRestarting(false);
    }
  }, [facingMode, startCamera, stopCamera]);

  const switchCamera = useCallback(() => {
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    stabilizerRef.current.reset();
    forearmEstimatorRef.current.reset();
    forearmFrameRef.current = null;
    radiusEstimatorRef.current.reset();
    radiusEstimateRef.current = null;
    feasibilityMonitorRef.current.reset();
    cadenceRef.current.reset();
    metricsRef.current = new TrackingMetrics();
    telemetryHistoryRef.current.clear();
    telemetryRendererRef.current?.draw([]);
    lastMetricsUiRef.current = 0;
    setDiagnosticsSnapshot(metricsRef.current.snapshot());
    setCadenceSnapshot(cadenceRef.current.snapshot());
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
    tattooGestureRef.current?.cancel();
    clearTattooGestureFeedback(tattooCanvasRef.current);
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
    const tattooGesture = tattooGestureRef.current;
    if (
      session !== 'previewing' ||
      !video ||
      !canvas ||
      !tattooCanvas ||
      !tattooGesture
    )
      return;
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
        failSession(createSessionFailure('renderer', error));
      });
      forearmGeometry.dispose();
      return;
    }
    let stopFrames: () => void = () => {};
    let unsubscribe: () => void = () => {};
    let cancelled = false;
    let initialized = false;
    arRendererRef.current = arRenderer;
    arRenderer.setTattoo(tattooAssetRef.current);
    arRenderer.setTattooAppearance(tattooAppearanceRef.current);
    arRenderer.setTattooVisible(tattooVisibleRef.current);
    arRenderer.setAnchor(tattooAnchorRef.current);
    if (!document.hidden) arRenderer.start();
    const startScheduling = () => {
      stopFrames();
      if (!cancelled && !document.hidden) {
        stopFrames = startFrameScheduler(video, tracker, {
          onFrameDropped: () => metricsRef.current.recordDrop(),
          getTargetFramesPerSecond: () =>
            cadenceRef.current.targetFramesPerSecond,
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        tattooGesture.cancel();
        clearTattooGestureFeedback(tattooCanvas);
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
          cadenceRef.current.recordInference(frame.inferenceMs);
          const stabilized = stabilizerRef.current.process(frame, nowMs);
          if (stabilized.state !== 'tracking') {
            tattooGesture.cancel();
            clearTattooGestureFeedback(tattooCanvas);
          }
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
              renderPixelRatioCap(
                renderResolutionModeRef.current,
                cadenceRef.current.level,
              ),
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
            setCadenceSnapshot(cadenceRef.current.snapshot());
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
        tattooGesture.cancel();
        clearTattooGestureFeedback(tattooCanvas);
        arRenderer.clearSurface();
        if (trackerRef.current === tracker) trackerRef.current = null;
        void tracker.dispose();
        const failure = createSessionFailure('tracker', error);
        setTrackerMessage(failure.title);
        failSession(failure);
      });
    return () => {
      cancelled = true;
      stopFrames();
      unsubscribe();
      tattooGesture.reset();
      clearTattooGestureFeedback(tattooCanvas);
      poseRenderer.clear();
      arRenderer.dispose();
      canPlaceTattooRef.current = false;
      if (arRendererRef.current === arRenderer) arRendererRef.current = null;
      viewportTransformRef.current = null;
      forearmGeometry.dispose();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [debug, failSession, session]);

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
        renderPixelRatioCap(
          renderResolutionModeRef.current,
          cadenceRef.current.level,
        ),
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
          aria-label="Place and adjust the tattoo on the visible forearm"
          onPointerDown={handleTattooPointerDown}
          onPointerMove={handleTattooPointerMove}
          onPointerUp={handleTattooPointerUp}
          onPointerCancel={handleTattooPointerCancel}
          onLostPointerCapture={handleTattooPointerCancel}
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
          <div className="stage-message" role="status" aria-live="polite">
            {message}
          </div>
        )}
      </section>

      <section className="control-panel" aria-label="Camera controls">
        <p className="eyebrow">Phase 5 · bring your own ink</p>
        <h1>Your sketch, on skin.</h1>
        <p className="lede">
          Choose a PNG or JPEG, then hold one forearm fully in frame. Tap to
          place; drag to move; pinch and twist to resize and rotate.
        </p>
        {sessionFailure && (
          <section
            ref={sessionErrorPanelRef}
            className="session-error-panel"
            role="alert"
            tabIndex={-1}
            aria-labelledby="session-error-title"
            aria-describedby="session-error-guidance"
          >
            <div className="session-error-heading">
              <span>Session issue</span>
              <b>{sessionFailure.category}</b>
            </div>
            <h2 id="session-error-title">{sessionFailure.title}</h2>
            <p id="session-error-guidance">{sessionFailure.guidance}</p>
            {sessionFailure.technicalDetail && (
              <code>{sessionFailure.technicalDetail}</code>
            )}
            <button
              type="button"
              onClick={() => void restartSession()}
              disabled={isRestarting}
            >
              {isRestarting ? 'Restarting…' : sessionFailure.retryLabel}
            </button>
            <small>
              Artwork, placement, and appearance settings stay saved.
            </small>
          </section>
        )}
        <section
          className={`artwork-panel is-${artwork.status}`}
          aria-labelledby="artwork-heading"
          aria-busy={artwork.status === 'loading'}
        >
          <div className="artwork-heading">
            <span>01 / artwork</span>
            <strong id="artwork-heading">Load your design</strong>
          </div>
          <label className="file-picker">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => void handleTattooFileChange(event)}
            />
            <span>
              {artwork.status === 'loading'
                ? 'Preparing image…'
                : 'Choose PNG or JPEG'}
            </span>
            <small>On-device only · 20 MB max · scaled to 2048 px</small>
          </label>
          <p
            className="artwork-status"
            role={artwork.status === 'error' ? 'alert' : 'status'}
          >
            <strong>{artwork.name}</strong>
            {artwork.detail}
          </p>
          <div className="appearance-controls">
            <label className="switch-control">
              <input
                type="checkbox"
                checked={tattooAppearance.removeWhiteBackground}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    removeWhiteBackground: event.target.checked,
                  }))
                }
              />
              <span>
                <b>Remove white paper</b>
                <small>Turns pale background pixels transparent</small>
              </span>
            </label>
            <label className="range-control">
              <span>
                Paper cutoff
                <output>
                  {Math.round(tattooAppearance.backgroundThreshold * 100)}%
                </output>
              </span>
              <input
                type="range"
                min="40"
                max="98"
                step="1"
                value={Math.round(tattooAppearance.backgroundThreshold * 100)}
                disabled={!tattooAppearance.removeWhiteBackground}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    backgroundThreshold: Number(event.target.value) / 100,
                  }))
                }
              />
            </label>
            <label className="range-control">
              <span>
                Edge softness
                <output>
                  {Math.round(tattooAppearance.backgroundFeather * 100)}%
                </output>
              </span>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={Math.round(tattooAppearance.backgroundFeather * 100)}
                disabled={!tattooAppearance.removeWhiteBackground}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    backgroundFeather: Number(event.target.value) / 100,
                  }))
                }
              />
            </label>
            <label className="switch-control is-compact">
              <input
                type="checkbox"
                checked={tattooAppearance.invert}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    invert: event.target.checked,
                  }))
                }
              />
              <span>
                <b>Invert paper and ink</b>
              </span>
            </label>
            <label className="range-control ink-strength">
              <span>
                Ink strength
                <output>{Math.round(tattooAppearance.opacity * 100)}%</output>
              </span>
              <input
                type="range"
                min="15"
                max="100"
                step="1"
                value={Math.round(tattooAppearance.opacity * 100)}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    opacity: Number(event.target.value) / 100,
                  }))
                }
              />
            </label>
            <label className="range-control">
              <span>
                Ink absorption
                <output>{Math.round(tattooAppearance.inkBlend * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(tattooAppearance.inkBlend * 100)}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    inkBlend: Number(event.target.value) / 100,
                  }))
                }
              />
            </label>
            <label className="range-control">
              <span>
                Tattoo edge fade
                <output>
                  {Math.round(tattooAppearance.edgeFeather * 100)}%
                </output>
              </span>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={Math.round(tattooAppearance.edgeFeather * 100)}
                onChange={(event) =>
                  setTattooAppearance((current) => ({
                    ...current,
                    edgeFeather: Number(event.target.value) / 100,
                  }))
                }
              />
            </label>
          </div>
        </section>
        <fieldset className="arm-selector">
          <legend>02 / target forearm</legend>
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
        <aside className="framing-guide" aria-label="Forearm framing guide">
          <span>Framing check</span>
          <ol>
            <li>
              <b>Show both joints</b>
              <small>Keep wrist and elbow visible with the full forearm.</small>
            </li>
            <li>
              <b>Face the skin forward</b>
              <small>
                Start with the broad side of the forearm toward camera.
              </small>
            </li>
            <li>
              <b>Hold, then place</b>
              <small>Wait for stable tracking before tapping the skin.</small>
            </li>
          </ol>
        </aside>
        <div className="placement-panel" aria-live="polite">
          <div className="placement-heading">
            <span>03 / placement</span>
            <b data-visible={tattooVisible}>
              {tattooVisible ? 'visible' : 'hidden'}
            </b>
          </div>
          <p>{tattooMessage}</p>
          {tattooAnchor && (
            <code>
              {tattooAnchor.region} · u {tattooAnchor.u.toFixed(3)} · v{' '}
              {tattooAnchor.v.toFixed(3)} · size {tattooAnchor.width.toFixed(3)}{' '}
              × {tattooAnchor.height.toFixed(3)} · rotation{' '}
              {signedDegrees((tattooAnchor.rotation * 180) / Math.PI)}
            </code>
          )}
          <div className="placement-controls">
            <label className="range-control">
              <span>
                Size
                <output>
                  {Math.round(
                    Math.max(
                      tattooAnchor?.width ?? 0.3,
                      tattooAnchor?.height ?? 0.3,
                    ) * 100,
                  )}
                  %
                </output>
              </span>
              <input
                type="range"
                min="5"
                max="80"
                step="1"
                value={Math.round(
                  Math.max(
                    tattooAnchor?.width ?? 0.3,
                    tattooAnchor?.height ?? 0.3,
                  ) * 100,
                )}
                disabled={!tattooAnchor}
                onChange={(event) =>
                  updateTattooSize(Number(event.target.value) / 100)
                }
              />
            </label>
            <label className="range-control">
              <span>
                Rotation
                <output>
                  {signedDegrees(
                    ((tattooAnchor?.rotation ?? 0) * 180) / Math.PI,
                  )}
                </output>
              </span>
              <input
                type="range"
                min="-180"
                max="179"
                step="1"
                value={Math.round(
                  ((tattooAnchor?.rotation ?? 0) * 180) / Math.PI,
                )}
                disabled={!tattooAnchor}
                onChange={(event) =>
                  updateTattooRotation(Number(event.target.value))
                }
              />
            </label>
          </div>
          <div className="placement-actions">
            <button
              type="button"
              aria-pressed={!tattooVisible}
              onClick={() => setTattooVisibility(!tattooVisible)}
              disabled={!hasTattooAsset}
            >
              {tattooVisible ? 'Hide tattoo' : 'Show tattoo'}
            </button>
            <button
              type="button"
              onClick={resetTattooAdjustments}
              disabled={!hasTattooAsset}
            >
              Reset edits
            </button>
            <button
              className="clear-placement"
              type="button"
              onClick={clearTattoo}
              disabled={!tattooAnchor}
            >
              Clear placement
            </button>
          </div>
        </div>
        <fieldset className="performance-panel">
          <legend>04 / performance</legend>
          <div className="performance-modes">
            {renderResolutionModes.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={renderResolutionMode === mode}
                onClick={() => selectRenderResolutionMode(mode)}
              >
                {renderResolutionLabels[mode]}
              </button>
            ))}
          </div>
          <div className="performance-readout" aria-live="polite">
            <span>
              <small>Tracking target</small>
              <b>{cadenceSnapshot.targetFramesPerSecond} FPS</b>
            </span>
            <span>
              <small>AR detail cap</small>
              <b>
                {renderPixelRatioCap(
                  renderResolutionMode,
                  cadenceSnapshot.level,
                )}
                ×
              </b>
            </span>
          </div>
          <p>
            Auto balances detail against measured inference cost. Sharp keeps
            maximum AR density; Efficient limits it to 1×.
          </p>
        </fieldset>
        <div className="controls">
          <button
            className="primary"
            type="button"
            onClick={() =>
              session === 'previewing' || session === 'error'
                ? void restartSession()
                : void startCamera()
            }
            disabled={session === 'requestingCamera' || isRestarting}
          >
            {isRestarting
              ? 'Restarting…'
              : session === 'requestingCamera'
                ? 'Connecting…'
                : session === 'previewing'
                  ? 'Restart session'
                  : session === 'error'
                    ? (sessionFailure?.retryLabel ?? 'Retry session')
                    : 'Start camera'}
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

function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function showTattooGestureMode(
  canvas: HTMLCanvasElement,
  mode: TattooGestureKind,
): void {
  canvas.dataset.gesture = mode;
}

function showTattooGestureFeedback(
  canvas: HTMLCanvasElement | null,
  update: TattooGestureUpdate,
): void {
  if (!canvas) return;
  showTattooGestureMode(canvas, update.kind);
  if (update.boundaryClamped && update.seamCrossed) {
    canvas.dataset.gestureFeedback = 'boundary-seam';
  } else if (update.boundaryClamped) {
    canvas.dataset.gestureFeedback = 'boundary';
  } else if (update.seamCrossed) {
    canvas.dataset.gestureFeedback = 'seam';
  } else {
    delete canvas.dataset.gestureFeedback;
  }
}

function clearTattooGestureFeedback(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  delete canvas.dataset.gesture;
  delete canvas.dataset.gestureFeedback;
}

function tattooGestureMessage(update: TattooGestureUpdate): string {
  if (update.boundaryClamped && update.seamCrossed) {
    return 'Edit clamped inside the forearm; seam wrapping remains continuous.';
  }
  if (update.boundaryClamped) {
    return 'Edit clamped inside the supported forearm boundary.';
  }
  if (update.seamCrossed) {
    return 'The design crosses the UV seam and wraps continuously.';
  }
  if (update.kind === 'transform') {
    return 'Scale and rotation updated in the local tangent plane.';
  }
  if (update.kind === 'drag') {
    return 'Position updated in forearm UV space.';
  }
  return 'Fixture anchored. Drag to move; pinch and twist to transform.';
}

function signedDegrees(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function artworkDimensionsMessage(
  decoded: DecodedTattooFile,
  fileSize: number,
): string {
  const source = `${decoded.sourceWidth} × ${decoded.sourceHeight} px`;
  const prepared = `${decoded.textureWidth} × ${decoded.textureHeight} px`;
  const dimensions = decoded.wasDownscaled
    ? `${source} → ${prepared}`
    : prepared;
  return `${dimensions} · ${formatFileSize(fileSize)} · kept on this device`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
