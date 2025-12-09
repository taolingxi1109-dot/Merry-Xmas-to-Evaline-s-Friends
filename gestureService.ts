import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { MODEL_ASSET_PATH } from '../constants.ts';

export class GestureService {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private requestRef: number | null = null;
  private onResult: (result: any) => void;

  constructor(onResult: (result: any) => void) {
    this.onResult = onResult;
  }

  async initialize() {
    console.log("Initializing GestureService...");
    
    // Explicitly point to the WASM binaries on jsdelivr to avoid CDN path resolution issues.
    // We use version 0.10.9 specifically to match the package version in importmap.
    const wasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm";
    
    console.log(`Fetching WASM binaries from: ${wasmUrl}`);
    const vision = await FilesetResolver.forVisionTasks(wasmUrl);
    console.log("WASM binaries fetched successfully.");

    try {
      console.log("Creating HandLandmarker (GPU)...");
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      console.log("HandLandmarker (GPU) created.");
    } catch (gpuError) {
      console.warn("GPU initialization failed, attempting CPU fallback...", gpuError);
      // Fallback to CPU if GPU fails (common on some mobile browsers or specific OS versions)
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      console.log("HandLandmarker (CPU) created.");
    }
  }

  start(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    console.log("Starting detection loop...");
    this.detect();
  }

  stop() {
    if (this.requestRef) {
      cancelAnimationFrame(this.requestRef);
    }
  }

  private detect = () => {
    if (this.handLandmarker && this.video && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(this.video, performance.now());
      this.onResult(results);
    }
    this.requestRef = requestAnimationFrame(this.detect);
  };
}

// Calculate the roll of the hand (tilt left/right)
// Returns value roughly between -1 (left tilt) and 1 (right tilt)
const calculateHandRotation = (landmarks: any[]): number => {
  if (!landmarks || landmarks.length === 0) return 0;
  const lm = landmarks[0];
  
  const p1 = lm[17]; // Pinky MCP
  const p2 = lm[2];  // Thumb MCP
  
  const dy = p1.y - p2.y;
  
  // Amplify the tilt for better control feeling
  return Math.max(-1, Math.min(1, dy * 5)); 
};

export const classifyGesture = (landmarks: any[]): { gesture: 'NONE' | 'OPEN_PALM' | 'CLOSED_FIST' | 'PINCH', rotation: number } => {
  const rotation = calculateHandRotation(landmarks);
  
  if (!landmarks || landmarks.length === 0) return { gesture: 'NONE', rotation: 0 };

  const lm = landmarks[0]; 

  const dist = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  };

  // 1. PINCH Detection (Thumb tip vs Index tip)
  const thumbTip = lm[4];
  const indexTip = lm[8];
  const pinchDistance = dist(thumbTip, indexTip);
  
  if (pinchDistance < 0.05) {
    return { gesture: 'PINCH', rotation };
  }

  // 2. FIST vs OPEN Check
  const wrist = lm[0];
  const tips = [lm[8], lm[12], lm[16], lm[20]]; 
  const mcps = [lm[5], lm[9], lm[13], lm[17]];

  let foldedCount = 0;
  for (let i = 0; i < 4; i++) {
    if (dist(tips[i], wrist) < dist(mcps[i], wrist)) {
      foldedCount++;
    }
  }

  if (foldedCount >= 3) return { gesture: 'CLOSED_FIST', rotation };

  return { gesture: 'OPEN_PALM', rotation };
};