export const PoseLandmark = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
} as const;

export const upperBodyConnections = [
  [PoseLandmark.leftShoulder, PoseLandmark.rightShoulder],
  [PoseLandmark.leftShoulder, PoseLandmark.leftElbow],
  [PoseLandmark.leftElbow, PoseLandmark.leftWrist],
  [PoseLandmark.leftWrist, PoseLandmark.leftPinky],
  [PoseLandmark.leftWrist, PoseLandmark.leftIndex],
  [PoseLandmark.leftWrist, PoseLandmark.leftThumb],
  [PoseLandmark.rightShoulder, PoseLandmark.rightElbow],
  [PoseLandmark.rightElbow, PoseLandmark.rightWrist],
  [PoseLandmark.rightWrist, PoseLandmark.rightPinky],
  [PoseLandmark.rightWrist, PoseLandmark.rightIndex],
  [PoseLandmark.rightWrist, PoseLandmark.rightThumb],
] as const;
