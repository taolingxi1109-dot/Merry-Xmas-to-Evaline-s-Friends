import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, Sparkles, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from '@react-three/postprocessing';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Upload } from 'lucide-react';

// --- TYPES ---
export enum AppMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  FOCUS = 'FOCUS',
}

export enum OrnamentType {
  GEM = 'GEM',
  PEARL = 'PEARL', 
  PHOTO = 'PHOTO',
}

export interface OrnamentData {
  id: string;
  type: OrnamentType;
  positionTree: THREE.Vector3;
  positionScatter: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  color: string;
  textureUrl?: string;
}

export interface GestureState {
  isHandDetected: boolean;
  gesture: 'NONE' | 'OPEN_PALM' | 'CLOSED_FIST' | 'PINCH';
  handRotation: number;
}

// --- CONSTANTS ---
const COLORS = {
  GOLD_PURE: '#FFD700',
  GOLD_CHAMPAGNE: '#F7E7CE',
  GOLD_ROSE: '#E0BFB8',
  MATTE_BLACK: '#1A1A1A',
  RICH_RED: '#C70039',
  DEEP_GREEN: '#003300',
  PLATINUM: '#E5E4E2',
  GOLD_ANTIQUE: '#C5A059'
};

const MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const TREE_HEIGHT = 15;
const TREE_RADIUS_BASE = 6.5;
const ORNAMENT_COUNT = 350;

// --- GESTURE SERVICE ---
class GestureService {
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
    const wasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm";
    
    console.log(`Fetching WASM binaries from: ${wasmUrl}`);
    const vision = await FilesetResolver.forVisionTasks(wasmUrl);
    
    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
    } catch (gpuError) {
      console.warn("GPU init failed, using CPU", gpuError);
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
    }
  }

  start(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    this.detect();
  }

  stop() {
    if (this.requestRef) cancelAnimationFrame(this.requestRef);
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

const calculateHandRotation = (landmarks: any[]): number => {
  if (!landmarks || landmarks.length === 0) return 0;
  const lm = landmarks[0];
  const p1 = lm[17]; 
  const p2 = lm[2];  
  const dy = p1.y - p2.y;
  return Math.max(-1, Math.min(1, dy * 5)); 
};

const classifyGesture = (landmarks: any[]): { gesture: 'NONE' | 'OPEN_PALM' | 'CLOSED_FIST' | 'PINCH', rotation: number } => {
  const rotation = calculateHandRotation(landmarks);
  if (!landmarks || landmarks.length === 0) return { gesture: 'NONE', rotation: 0 };

  const lm = landmarks[0]; 
  const dist = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  };

  const thumbTip = lm[4];
  const indexTip = lm[8];
  if (dist(thumbTip, indexTip) < 0.05) return { gesture: 'PINCH', rotation };

  const wrist = lm[0];
  const tips = [lm[8], lm[12], lm[16], lm[20]]; 
  const mcps = [lm[5], lm[9], lm[13], lm[17]];

  let foldedCount = 0;
  for (let i = 0; i < 4; i++) {
    if (dist(tips[i], wrist) < dist(mcps[i], wrist)) foldedCount++;
  }

  if (foldedCount >= 3) return { gesture: 'CLOSED_FIST', rotation };
  return { gesture: 'OPEN_PALM', rotation };
};

// --- COMPONENTS ---

const LoadingOverlay: React.FC<{ isLoading: boolean; status: string }> = ({ isLoading, status }) => {
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000">
      <div className="w-16 h-16 border-4 border-t-transparent border-yellow-600 rounded-full animate-spin mb-8 shadow-[0_0_15px_rgba(212,175,55,0.5)]"></div>
      <h2 className="text-3xl font-cinzel text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-500 to-yellow-200 animate-pulse tracking-widest">
        LOADING
      </h2>
      <p className="mt-4 text-gray-400 font-serif italic text-sm">{status}</p>
    </div>
  );
};

interface UIOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onFileUpload: (files: FileList | null) => void;
  gesture: string;
  hasImages: boolean;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ videoRef, onFileUpload, gesture, hasImages }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
      <header className="flex flex-col items-center justify-center mt-4">
        <h1 className="font-cinzel text-4xl md:text-6xl text-gold-gradient text-glow tracking-widest text-center">
          Merry Christmas
        </h1>
        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mt-4 opacity-70"></div>
      </header>

      <div className="flex-1 flex items-center justify-center">
        {!hasImages && (
          <div className="pointer-events-auto bg-black/90 border border-yellow-800/60 p-10 rounded-xl backdrop-blur-md text-center max-w-md shadow-[0_0_50px_rgba(212,175,55,0.15)] transform transition-all hover:scale-105">
            <h3 className="text-yellow-400 font-cinzel text-2xl mb-4 tracking-wider">The Golden Collection</h3>
            <p className="text-gray-400 font-serif mb-8 italic text-lg">Curate your memories in gold and light. Upload photos to craft your masterpiece.</p>
            <button 
              onClick={() => inputRef.current?.click()}
              className="px-10 py-4 bg-gradient-to-r from-yellow-800 to-yellow-600 text-yellow-100 font-cinzel tracking-widest text-sm rounded-sm border border-yellow-400/30 hover:shadow-[0_0_30px_rgba(212,175,55,0.5)] transition-all"
            >
              <span className="flex items-center gap-2 uppercase">Begin Experience</span>
            </button>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              ref={inputRef} 
              className="hidden" 
              onChange={(e) => onFileUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between w-full">
        <div className="relative pointer-events-auto group">
          <div className="w-32 h-24 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-yellow-800/30 shadow-2xl relative bg-black transition-all group-hover:border-yellow-600/80">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" 
              autoPlay 
              playsInline 
              muted 
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
               <span className="text-[10px] text-yellow-500 font-cinzel tracking-widest">{gesture}</span>
               <div className={`w-1.5 h-1.5 rounded-full ${gesture !== 'NONE' ? 'bg-yellow-400 shadow-[0_0_10px_gold]' : 'bg-red-900'}`}></div>
            </div>
          </div>
        </div>

        <div className="hidden md:block bg-black/80 backdrop-blur-xl border-l border-yellow-700/40 p-6 rounded-l-lg max-w-xs shadow-2xl">
          <h4 className="text-yellow-500 font-cinzel text-xs uppercase tracking-[0.2em] border-b border-yellow-800/30 pb-3 mb-4">Master Controls</h4>
          <ul className="space-y-4 text-xs font-serif text-gray-400">
            <li className="flex items-center gap-3">
              <span className="text-lg">✊</span>
              <span><strong className="text-yellow-200 font-cinzel">Aggregate</strong> <br/>Form the Golden Tree</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-lg">🖐</span>
              <span><strong className="text-yellow-200 font-cinzel">Scatter</strong> <br/>Release into Stardust</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-lg">👋</span>
              <span><strong className="text-yellow-200 font-cinzel">Tilt Hand</strong> <br/>Rotate View</span>
            </li>
             <li className="flex items-center gap-3">
              <span className="text-lg">👌</span>
              <span><strong className="text-yellow-200 font-cinzel">Pinch</strong> <br/>Focus Memory</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

interface PhotoFrameProps {
  url: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale?: number;
  isFocused?: boolean;
}

const PhotoFrame: React.FC<PhotoFrameProps> = ({ url, position, rotation, scale = 1, isFocused = false }) => {
  const texture = useTexture(url);
  
  const frameMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: COLORS.GOLD_ANTIQUE,
    metalness: 1,
    roughness: 0.1,
    envMapIntensity: 2,
  }), []);

  const photoMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false, 
  }), [texture]);

  const backingMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0x000000,
    metalness: 0.5,
    roughness: 0.8,
  }), []);

  const frameThickness = 0.05;
  const frameDepth = 0.1;
  const width = 1.2;
  const height = 1.6;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, 0, frameDepth / 2 + 0.01]} material={photoMaterial}>
        <planeGeometry args={[width - frameThickness * 2, height - frameThickness * 2]} />
      </mesh>
      <mesh position={[0, height / 2 - frameThickness / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[width, frameThickness, frameDepth]} />
      </mesh>
      <mesh position={[0, -height / 2 + frameThickness / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[width, frameThickness, frameDepth]} />
      </mesh>
      <mesh position={[-width / 2 + frameThickness / 2, 0, 0]} material={frameMaterial}>
        <boxGeometry args={[frameThickness, height - frameThickness * 2, frameDepth]} />
      </mesh>
      <mesh position={[width / 2 - frameThickness / 2, 0, 0]} material={frameMaterial}>
        <boxGeometry args={[frameThickness, height - frameThickness * 2, frameDepth]} />
      </mesh>
      <mesh position={[0, 0, -0.01]} material={backingMaterial}>
        <boxGeometry args={[width, height, 0.02]} />
      </mesh>
      {isFocused && (
        <pointLight distance={3} intensity={2} color={COLORS.GOLD_PURE} />
      )}
    </group>
  );
};

interface TreeSceneProps {
  mode: AppMode;
  userImages: string[];
  handRotation: number;
}

const TreeScene: React.FC<TreeSceneProps> = ({ mode, userImages, handRotation }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const { camera } = useThree();
  const smoothRotation = useRef(0);

  const ornaments = useMemo(() => {
    const items: OrnamentData[] = [];
    const getLuxuryColor = () => {
      const r = Math.random();
      if (r > 0.60) return COLORS.GOLD_PURE;      
      if (r > 0.45) return COLORS.GOLD_CHAMPAGNE; 
      if (r > 0.35) return COLORS.MATTE_BLACK;    
      if (r > 0.15) return COLORS.RICH_RED;       
      return COLORS.DEEP_GREEN;                   
    };

    userImages.forEach((url, i) => {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5)); 
      const t = (i + 1) / (userImages.length + 1);
      const y = (t * TREE_HEIGHT * 0.7) - (TREE_HEIGHT * 0.35);
      const r = ((TREE_HEIGHT / 2) - y) / (TREE_HEIGHT) * TREE_RADIUS_BASE * 1.2; 
      const theta = i * goldenAngle * 8 + Math.PI; 

      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      items.push({
        id: `photo-${i}`,
        type: OrnamentType.PHOTO,
        textureUrl: url,
        positionTree: new THREE.Vector3(x, y, z),
        positionScatter: new THREE.Vector3((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10),
        rotation: new THREE.Euler(0, -theta - Math.PI / 2, 0),
        scale: 1.0,
        color: COLORS.GOLD_PURE
      });
    });

    for (let i = 0; i < ORNAMENT_COUNT; i++) {
        const yNorm = i / ORNAMENT_COUNT; 
        const y = (yNorm * TREE_HEIGHT) - (TREE_HEIGHT / 2);
        const radiusAtHeight = ((TREE_HEIGHT / 2) - y) / TREE_HEIGHT * TREE_RADIUS_BASE;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const theta = i * goldenAngle;
        const r = radiusAtHeight * Math.sqrt(Math.random() * 0.3 + 0.7); 
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const type = Math.random() > 0.4 ? OrnamentType.GEM : OrnamentType.PEARL;
        const color = getLuxuryColor();

        items.push({
            id: `ornament-${i}`,
            type,
            positionTree: new THREE.Vector3(x, y, z),
            positionScatter: new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 25),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            scale: Math.random() * 0.3 + 0.1, 
            color
        });
    }
    return items;
  }, [userImages]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    smoothRotation.current = THREE.MathUtils.lerp(smoothRotation.current, handRotation, 0.1);
    
    if (mode !== AppMode.FOCUS) {
        const rotationSpeed = 0.2 + (smoothRotation.current * 1.5); 
        groupRef.current.rotation.y += rotationSpeed * delta;
    }

    groupRef.current.children.forEach((child, i) => {
        const data = ornaments[i];
        if (!data) return;

        let targetPos = data.positionTree;
        let targetScale = new THREE.Vector3(data.scale, data.scale, data.scale);
        
        if (mode === AppMode.SCATTER) {
            targetPos = data.positionScatter;
            targetPos.y += Math.sin(t * 0.5 + data.positionScatter.x) * 0.05;
        } else if (mode === AppMode.FOCUS) {
            targetPos = data.positionScatter;
            if (data.type === OrnamentType.PHOTO && i === focusedIndex) {
               const camDir = new THREE.Vector3();
               camera.getWorldDirection(camDir);
               const camPos = camera.position.clone();
               const centerPos = camPos.add(camDir.multiplyScalar(5));
               const invWorld = groupRef.current!.matrixWorld.clone().invert();
               const localTarget = centerPos.clone().applyMatrix4(invWorld);
               targetPos = localTarget;
               targetScale.set(4, 4, 4);
               child.lookAt(camera.position);
            }
        }

        const lerpFactor = mode === AppMode.FOCUS ? 4 : 2;
        child.position.lerp(targetPos, delta * lerpFactor);
        child.scale.lerp(targetScale, delta * lerpFactor);

        if (data.type !== OrnamentType.PHOTO) {
             child.rotation.x += delta * 0.2;
             child.rotation.y += delta * 0.3;
        }
    });
  });

  useEffect(() => {
    if (mode === AppMode.FOCUS && userImages.length > 0) {
        const photoIndices = ornaments.map((o, i) => o.type === OrnamentType.PHOTO ? i : -1).filter(i => i !== -1);
        if (photoIndices.length > 0) {
             const nextIndex = photoIndices[Math.floor(Math.random() * photoIndices.length)];
             setFocusedIndex(nextIndex);
        }
    }
  }, [mode, userImages.length]);

  return (
    <>
      <color attach="background" args={['#000000']} />
      <Environment preset="studio" /> 
      <ambientLight intensity={0.1} />
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.5} 
        penumbra={1} 
        intensity={2} 
        color={COLORS.GOLD_PURE} 
        castShadow 
      />
      <pointLight position={[-10, 0, -10]} intensity={1} color="#ffffff" />
      <pointLight position={[0, -10, 5]} intensity={2} color={COLORS.RICH_RED} distance={20} />
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.2} />
      <Sparkles 
        count={300} 
        scale={25} 
        size={4} 
        speed={0.2} 
        opacity={0.7} 
        color={COLORS.GOLD_CHAMPAGNE} 
      />
      <group ref={groupRef}>
        {ornaments.map((item, i) => {
            if (item.type === OrnamentType.PHOTO && item.textureUrl) {
                return (
                    <PhotoFrame 
                        key={item.id} 
                        url={item.textureUrl} 
                        position={item.positionTree} 
                        rotation={item.rotation}
                        scale={item.scale}
                        isFocused={mode === AppMode.FOCUS && i === focusedIndex}
                    />
                );
            }
            return (
                <mesh key={item.id} position={item.positionTree} rotation={item.rotation} scale={item.scale} castShadow receiveShadow>
                    {item.type === OrnamentType.GEM ? (
                        <icosahedronGeometry args={[0.7, 0]} /> 
                    ) : (
                        <octahedronGeometry args={[0.6, 0]} /> 
                    )}
                    <meshPhysicalMaterial 
                        color={item.color} 
                        metalness={1.0} 
                        roughness={0.15}
                        clearcoat={1.0}
                        clearcoatRoughness={0.1}
                        envMapIntensity={2.5} 
                        emissive={item.color}
                        emissiveIntensity={0.2} 
                    />
                </mesh>
            );
        })}
      </group>
      <OrbitControls 
        makeDefault 
        enableZoom={false} 
        enablePan={false} 
        maxPolarAngle={Math.PI / 1.6} 
        minPolarAngle={Math.PI / 3} 
        rotateSpeed={0.5}
      />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom 
            luminanceThreshold={0.7} 
            luminanceSmoothing={0.5} 
            intensity={1.5} 
            radius={0.7} 
            mipmapBlur 
        />
        <Vignette eskil={false} offset={0.2} darkness={0.8} />
        <Noise opacity={0.03} /> 
        <ToneMapping adaptive={true} resolution={256} middleGrey={0.6} maxLuminance={16.0} averageLuminance={1.0} adaptationRate={1.0} />
      </EffectComposer>
    </>
  );
};

// --- APP ---

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState("Initializing System...");
  const [gestureState, setGestureState] = useState<GestureState>({ 
    isHandDetected: false, 
    gesture: 'NONE',
    handRotation: 0 
  });
  const [appMode, setAppMode] = useState<AppMode>(AppMode.TREE);
  const [userImages, setUserImages] = useState<string[]>([]);
  
  const gestureServiceRef = useRef<GestureService | null>(null);

  const handleGestureResult = useCallback((result: any) => {
    const landmarks = result.worldLandmarks;
    if (landmarks && landmarks.length > 0) {
      const { gesture, rotation } = classifyGesture(landmarks);
      
      setGestureState({
        isHandDetected: true,
        gesture: gesture,
        handRotation: rotation
      });

      if (gesture === 'CLOSED_FIST') {
        setAppMode(AppMode.TREE);
      } else if (gesture === 'OPEN_PALM') {
        setAppMode(AppMode.SCATTER);
      } else if (gesture === 'PINCH') {
        setAppMode(AppMode.FOCUS);
      }

    } else {
      setGestureState(prev => ({ ...prev, isHandDetected: false, gesture: 'NONE' })); 
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        setLoadStatus("Downloading AI Models (this may take a moment)...");
        const service = new GestureService(handleGestureResult);
        
        const initPromise = service.initialize();
        
        const warningTimer = setTimeout(() => {
           if (isMounted) setLoadStatus("Network slow? Still downloading large AI models...");
        }, 15000);

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection Timeout: Unable to reach Google/JSDelivr servers.")), 60000)
        );

        await Promise.race([initPromise, timeoutPromise]);
        clearTimeout(warningTimer);
        
        if (!isMounted) return;
        gestureServiceRef.current = service;
        
        setLoadStatus("Requesting Camera Access...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => {
                   if (isMounted) {
                       setLoadStatus("Starting Vision Engine...");
                       service.start(videoRef.current!);
                       setIsLoading(false);
                   }
                };
            }
        } else {
             throw new Error("Camera not available or permission denied.");
        }
      } catch (err) {
        console.error("Initialization failed", err);
        let errorMsg = "Error: Unknown.";
        if (err instanceof Error) {
            errorMsg = `Error: ${err.message}`;
        } else if (typeof err === 'string') {
            errorMsg = `Error: ${err}`;
        }
        if (isMounted) setLoadStatus(errorMsg + " Please refresh.");
      }
    };

    init();
    
    const safetyTimer = setTimeout(() => {
        if (isLoading && isMounted) {
            setLoadStatus("System stalled. Check console logs.");
        }
    }, 65000);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      gestureServiceRef.current?.stop();
    };
  }, [handleGestureResult]);

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const newImages: string[] = [];
    Array.from(files).forEach(file => {
        const url = URL.createObjectURL(file);
        newImages.push(url);
    });
    setUserImages(prev => [...prev, ...newImages]);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <LoadingOverlay isLoading={isLoading} status={loadStatus} />
      <Canvas shadows camera={{ position: [0, 0, 25], fov: 45 }} dpr={[1, 2]}>
        <TreeScene 
            mode={appMode} 
            userImages={userImages} 
            handRotation={gestureState.handRotation}
        />
      </Canvas>
      <UIOverlay 
        videoRef={videoRef} 
        onFileUpload={handleFileUpload} 
        gesture={gestureState.gesture}
        hasImages={userImages.length > 0}
      />
    </div>
  );
};

// --- ROOT ---
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root not found");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const loader = document.getElementById('initial-loader');
if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 500);
}
