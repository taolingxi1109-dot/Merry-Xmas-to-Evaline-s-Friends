import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { GestureService, classifyGesture } from './services/gestureService.ts';
import TreeScene from './components/TreeScene.tsx';
import UIOverlay from './components/UIOverlay.tsx';
import LoadingOverlay from './components/LoadingOverlay.tsx';
import { AppMode, GestureState } from './types.ts';

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

      // State Machine with Transition Logic
      if (gesture === 'CLOSED_FIST') {
        setAppMode(AppMode.TREE);
      } else if (gesture === 'OPEN_PALM') {
        setAppMode(AppMode.SCATTER);
      } else if (gesture === 'PINCH') {
        // "Grab" logic: If we are in scatter or tree, pinch grabs a photo
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
        
        // Timeout logic:
        // 1. Hard timeout at 60 seconds (reject)
        // 2. Soft warning at 15 seconds (update UI)
        
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
                // Wait for video to actually load data
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
    
    // Global safety timer just in case logic hangs elsewhere
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
      
      {/* 3D Scene */}
      <Canvas shadows camera={{ position: [0, 0, 25], fov: 45 }} dpr={[1, 2]}>
        <TreeScene 
            mode={appMode} 
            userImages={userImages} 
            handRotation={gestureState.handRotation}
        />
      </Canvas>

      {/* UI & Camera Overlay */}
      <UIOverlay 
        videoRef={videoRef} 
        onFileUpload={handleFileUpload} 
        gesture={gestureState.gesture}
        hasImages={userImages.length > 0}
      />
    </div>
  );
};

export default App;