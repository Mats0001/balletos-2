export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseResultsData {
  landmarks: PoseLandmark[];
  worldLandmarks?: PoseLandmark[];
}

export class RealMediaPipePoseService {
  private pose: any = null;
  private isInitialized = false;
  private isProcessingFrame = false;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const PoseClass = (window as any).Pose || (await import('@mediapipe/pose')).Pose;

      this.pose = new PoseClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      // BALANCED MODEL (modelComplexity: 1) — good accuracy + real-time performance
      this.pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      // MediaPipe auto-loads WASM on first send() - do NOT call pose.initialize()
      // as it corrupts the WASM module state with "Module.arguments has been replaced"

      this.isInitialized = true;
      console.log("✅ Heavy MediaPipe Pose Engine (v2.0) initialized with 3D World Landmark Support!");
    } catch (err) {
      console.warn("⚠️ MediaPipe pose engine initialization warning:", err);
    }
  }

  public reset(): void {
    if (this.pose && typeof this.pose.reset === 'function') {
      try {
        this.pose.reset();
        console.log("🔄 MediaPipe Pose temporal tracking reset for new video source.");
      } catch (err) {
        console.warn("⚠️ Error resetting MediaPipe pose state:", err);
      }
    }
    this.isProcessingFrame = false;
  }

  // Reusable offscreen canvas for input downscaling
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private static readonly MAX_INPUT_DIM = 480; // Downscale to max 480px for speed

  public async processFrame(
    videoElem: HTMLVideoElement | HTMLCanvasElement,
    onResults: (data: PoseResultsData) => void
  ): Promise<void> {
    if (!this.pose || !videoElem) return;
    
    // STRICT VALIDATION: Ensure element has valid pixel data
    if (videoElem instanceof HTMLVideoElement) {
      if (videoElem.readyState < 2 || !videoElem.videoWidth || !videoElem.videoHeight) return;
      if (videoElem.paused && videoElem.ended) return;
    }
    
    // Prevent frame queue backlog
    if (this.isProcessingFrame) return;

    try {
      this.isProcessingFrame = true;
      const sendStart = performance.now();

      this.pose.onResults((results: any) => {
        const latencyMs = Math.round(performance.now() - sendStart);
        const W = window as any;
        if (!W.__infLatency) W.__infLatency = [];
        W.__infLatency.push(latencyMs);
        if (W.__infLatency.length > 30) W.__infLatency.shift();

        if (results && results.poseLandmarks && results.poseLandmarks.length >= 33) {
          onResults({
            landmarks: results.poseLandmarks,
            worldLandmarks: results.poseWorldLandmarks || undefined
          });
        }
        this.isProcessingFrame = false;
      });

      // Downscale input for faster inference.
      // ACTUAL MATH for 960×1280 portrait (longest edge = 1280):
      //   scale = min(480/960, 480/1280) = min(0.500, 0.375) = 0.375
      //   dstW = 960 × 0.375 = 360
      //   dstH = 1280 × 0.375 = 480
      // Result: 360×480 (NOT 480×640 as the old comment claimed)
      // For 1920×1080 landscape (longest edge = 1920):
      //   scale = min(480/1920, 480/1080) = min(0.250, 0.444) = 0.250
      //   dstW = 480, dstH = 270 → 480×270
      // TODO (Sprint 2): Make MAX_INPUT_DIM adaptive (480=fast/720=accurate)
      // and log actual dims to FrameDescriptor for reproducibility.
      const srcW = videoElem instanceof HTMLVideoElement ? videoElem.videoWidth : videoElem.width;
      const srcH = videoElem instanceof HTMLVideoElement ? videoElem.videoHeight : videoElem.height;
      const maxDim = RealMediaPipePoseService.MAX_INPUT_DIM;

      if (srcW > maxDim || srcH > maxDim) {
        const scale = Math.min(maxDim / srcW, maxDim / srcH);
        const dstW = Math.round(srcW * scale);
        const dstH = Math.round(srcH * scale);

        if (!this.offscreenCanvas) {
          this.offscreenCanvas = document.createElement('canvas');
          this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        }
        this.offscreenCanvas.width = dstW;
        this.offscreenCanvas.height = dstH;
        this.offscreenCtx!.drawImage(videoElem, 0, 0, dstW, dstH);

        await this.pose.send({ image: this.offscreenCanvas });
      } else {
        await this.pose.send({ image: videoElem });
      }
    } catch (err) {
      this.isProcessingFrame = false;
    }
  }
}

export const realMediaPipePose = new RealMediaPipePoseService();
