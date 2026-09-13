import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../contracts';
import { PoseLandmark } from './landmark-indices';
import { PoseStabilizer } from './PoseStabilizer';

const options = {
  stateMachine: {
    goodFramesToTrack: 2,
    badFramesToLose: 2,
    goodFramesToRecover: 2,
    recoveryTimeoutMs: 1000,
  },
  lostFadeDurationMs: 500,
};

describe('PoseStabilizer', () => {
  it('acquires a visible arm after consecutive good frames', () => {
    const stabilizer = new PoseStabilizer(options);

    expect(stabilizer.process(poseFrame(0, 0.9, 0), 0).state).toBe('acquiring');
    const result = stabilizer.process(poseFrame(50, 0.9, 0), 50);

    expect(result.state).toBe('tracking');
    expect(result.frame).not.toBeNull();
    expect(stabilizer.side).toBe('left');
  });

  it('freezes and fades the last stable pose during loss', () => {
    const stabilizer = trackedStabilizer();
    const stable = stabilizer.process(poseFrame(100, 0.9, 0), 100).frame;
    stabilizer.process(poseFrame(150, 0, 0), 150);

    const lost = stabilizer.process(poseFrame(200, 0, 0), 200);
    const fading = stabilizer.process(poseFrame(450, 0, 0), 450);

    expect(lost.state).toBe('trackingLost');
    expect(lost.frame).toBe(stable);
    expect(lost.opacity).toBe(1);
    expect(fading.frame).toBe(stable);
    expect(fading.opacity).toBeCloseTo(0.5);
  });

  it('recovers only the originally selected arm', () => {
    const stabilizer = trackedStabilizer();
    stabilizer.process(poseFrame(100, 0, 0), 100);
    stabilizer.process(poseFrame(150, 0, 0), 150);

    const otherArm = stabilizer.process(poseFrame(200, 0, 1), 200);
    const originalArm = stabilizer.process(poseFrame(250, 0.9, 1), 250);
    const recovered = stabilizer.process(poseFrame(300, 0.9, 1), 300);

    expect(otherArm.state).toBe('trackingLost');
    expect(otherArm.confidence.side).toBe('left');
    expect(originalArm.state).toBe('trackingLost');
    expect(recovered.state).toBe('tracking');
    expect(stabilizer.side).toBe('left');
  });

  it('returns to acquiring after a prolonged loss', () => {
    const stabilizer = trackedStabilizer();
    stabilizer.process(poseFrame(100, 0, 0), 100);
    stabilizer.process(poseFrame(150, 0, 0), 150);

    const result = stabilizer.process(poseFrame(1150, 0, 0), 1150);

    expect(result.state).toBe('acquiring');
    expect(result.frame).toBeNull();
    expect(stabilizer.side).toBe('left');
  });

  it('resets tracking only when the user selects another side', () => {
    const stabilizer = trackedStabilizer();

    stabilizer.selectSide('right');
    const result = stabilizer.process(poseFrame(100, 1, 0.9), 100);

    expect(stabilizer.side).toBe('right');
    expect(result.state).toBe('acquiring');
    expect(result.confidence.visibility).toBeCloseTo(0.9);
  });
});

function trackedStabilizer(): PoseStabilizer {
  const stabilizer = new PoseStabilizer(options);
  stabilizer.process(poseFrame(0, 0.9, 0), 0);
  stabilizer.process(poseFrame(50, 0.9, 0), 50);
  return stabilizer;
}

function poseFrame(
  timestampMs: number,
  leftVisibility: number,
  rightVisibility: number,
): PoseFrame {
  const landmarks = Array.from({ length: 23 }, () => point(0));
  for (const index of [
    PoseLandmark.leftShoulder,
    PoseLandmark.leftElbow,
    PoseLandmark.leftWrist,
    PoseLandmark.leftThumb,
    PoseLandmark.leftIndex,
    PoseLandmark.leftPinky,
  ]) {
    landmarks[index] = point(leftVisibility);
  }
  for (const index of [
    PoseLandmark.rightShoulder,
    PoseLandmark.rightElbow,
    PoseLandmark.rightWrist,
    PoseLandmark.rightThumb,
    PoseLandmark.rightIndex,
    PoseLandmark.rightPinky,
  ]) {
    landmarks[index] = point(rightVisibility);
  }
  return { frameId: timestampMs, timestampMs, landmarks, inferenceMs: 5 };
}

function point(visibility: number): PosePoint {
  return {
    image: { x: 0.5, y: 0.5, z: 0 },
    world: { x: 0, y: 0, z: 0 },
    visibility,
  };
}
