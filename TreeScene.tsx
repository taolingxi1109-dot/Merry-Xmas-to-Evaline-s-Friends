import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from '@react-three/postprocessing';
import * as THREE from 'three';
import { AppMode, OrnamentData, OrnamentType } from '../types.ts';
import { COLORS, ORNAMENT_COUNT, TREE_HEIGHT, TREE_RADIUS_BASE } from '../constants.ts';
import PhotoFrame from './PhotoFrame.tsx';

interface TreeSceneProps {
  mode: AppMode;
  userImages: string[];
  handRotation: number;
}

const TreeScene: React.FC<TreeSceneProps> = ({ mode, userImages, handRotation }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const { camera } = useThree();
  
  // Smoothing ref for rotation
  const smoothRotation = useRef(0);

  // --- 1. Generation Logic: Luxury Golden Spiral ---
  const ornaments = useMemo(() => {
    const items: OrnamentData[] = [];
    
    // Weighted random color picker
    // Adjusted to increase RED presence for Christmas feel
    const getLuxuryColor = () => {
      const r = Math.random();
      if (r > 0.60) return COLORS.GOLD_PURE;      // 40% Gold
      if (r > 0.45) return COLORS.GOLD_CHAMPAGNE; // 15% Champagne
      if (r > 0.35) return COLORS.MATTE_BLACK;    // 10% Black (Reduced slightly)
      if (r > 0.15) return COLORS.RICH_RED;       // 20% Red (Significantly Increased)
      return COLORS.DEEP_GREEN;                   // 15% Green
    };

    // A. User Photos (Integrated into spiral)
    userImages.forEach((url, i) => {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5)); 
      const t = (i + 1) / (userImages.length + 1);
      
      // Position photos in the "sweet spot" of the tree
      const y = (t * TREE_HEIGHT * 0.7) - (TREE_HEIGHT * 0.35);
      const r = ((TREE_HEIGHT / 2) - y) / (TREE_HEIGHT) * TREE_RADIUS_BASE * 1.2; // Slightly outside
      const theta = i * goldenAngle * 8 + Math.PI; // Offset angle

      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      items.push({
        id: `photo-${i}`,
        type: OrnamentType.PHOTO,
        textureUrl: url,
        positionTree: new THREE.Vector3(x, y, z),
        // Scatter photos further out
        positionScatter: new THREE.Vector3((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10),
        rotation: new THREE.Euler(0, -theta - Math.PI / 2, 0),
        scale: 1.0,
        color: COLORS.GOLD_PURE
      });
    });

    // B. Luxury Gems (The Tree Body)
    for (let i = 0; i < ORNAMENT_COUNT; i++) {
        // Normalized height
        const yNorm = i / ORNAMENT_COUNT; 
        const y = (yNorm * TREE_HEIGHT) - (TREE_HEIGHT / 2);
        
        // Cone radius at this height
        const radiusAtHeight = ((TREE_HEIGHT / 2) - y) / TREE_HEIGHT * TREE_RADIUS_BASE;
        
        // Fibonacci Spiral Distribution
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const theta = i * goldenAngle;
        
        // Distribution: Bias towards surface but allow some internal volume for depth
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

  // --- 2. Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const t = state.clock.getElapsedTime();

    // A. Rotation Logic (Hand Control)
    // Lerp the hand rotation input for smoothness
    smoothRotation.current = THREE.MathUtils.lerp(smoothRotation.current, handRotation, 0.1);
    
    // If in Tree or Scatter mode, allow rotation
    if (mode !== AppMode.FOCUS) {
        // Auto rotate slowly + Hand Control
        // handRotation is -1 to 1. 
        const rotationSpeed = 0.2 + (smoothRotation.current * 1.5); 
        groupRef.current.rotation.y += rotationSpeed * delta;
    }

    // Process every ornament
    groupRef.current.children.forEach((child, i) => {
        const data = ornaments[i];
        if (!data) return;

        let targetPos = data.positionTree;
        let targetScale = new THREE.Vector3(data.scale, data.scale, data.scale);
        
        // State Logic
        if (mode === AppMode.SCATTER) {
            targetPos = data.positionScatter;
            // Floating sensation
            targetPos.y += Math.sin(t * 0.5 + data.positionScatter.x) * 0.05;
        } else if (mode === AppMode.FOCUS) {
            targetPos = data.positionScatter;
            
            // Focus Logic: Is this the selected photo?
            if (data.type === OrnamentType.PHOTO && i === focusedIndex) {
               // Calculate "Screen Center" in World Space
               // We put it fixed in front of camera
               const camDir = new THREE.Vector3();
               camera.getWorldDirection(camDir);
               const camPos = camera.position.clone();
               
               // Target: 5 units in front of camera
               const centerPos = camPos.add(camDir.multiplyScalar(5));
               
               // We need to counteract the group rotation so the photo stays centered on screen
               // Convert world target to local target
               // Inverse group matrix * worldPos
               const invWorld = groupRef.current!.matrixWorld.clone().invert();
               const localTarget = centerPos.clone().applyMatrix4(invWorld);
               
               targetPos = localTarget; // Move to this local position
               
               // Look at camera? 
               // Simple lookAt works in world space, but since we are inside a rotating group,
               // we let the LookAt happen in update (Threejs handles world transform usually, 
               // but for children of rotated groups, we might need manual quaternion updates if we want it perfectly locked).
               // Simplest: just scale up huge.
               targetScale.set(4, 4, 4);
               
               // Force look at camera every frame
               child.lookAt(camera.position);
            }
        }

        // Apply Lerp (Smooth physics-like transition)
        // Focus moves faster (snappier)
        const lerpFactor = mode === AppMode.FOCUS ? 4 : 2;
        child.position.lerp(targetPos, delta * lerpFactor);
        child.scale.lerp(targetScale, delta * lerpFactor);

        // Gem Rotation (Sparkle effect)
        if (data.type !== OrnamentType.PHOTO) {
             child.rotation.x += delta * 0.2;
             child.rotation.y += delta * 0.3;
        }
    });
  });

  // Cycle focus index when entering focus mode
  useEffect(() => {
    if (mode === AppMode.FOCUS && userImages.length > 0) {
        const photoIndices = ornaments.map((o, i) => o.type === OrnamentType.PHOTO ? i : -1).filter(i => i !== -1);
        if (photoIndices.length > 0) {
             // Randomly pick a photo to focus on
             const nextIndex = photoIndices[Math.floor(Math.random() * photoIndices.length)];
             setFocusedIndex(nextIndex);
        }
    }
  }, [mode, userImages.length]);

  return (
    <>
      <color attach="background" args={['#000000']} />
      
      {/* 3. Luxury Lighting Setup */}
      {/* Studio lighting environment for metallic reflections */}
      <Environment preset="studio" /> 
      
      <ambientLight intensity={0.1} />
      
      {/* Main Key Light (Warm Gold) */}
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.5} 
        penumbra={1} 
        intensity={2} 
        color={COLORS.GOLD_PURE} 
        castShadow 
      />
      
      {/* Fill Light (Cool Silver/White) to bring out diamonds */}
      <pointLight position={[-10, 0, -10]} intensity={1} color="#ffffff" />
      
      {/* Rim Light (Red/Green Holiday Accent) */}
      <pointLight position={[0, -10, 5]} intensity={2} color={COLORS.RICH_RED} distance={20} />

      {/* 4. Atmosphere */}
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={0.2} />
      
      {/* Floating Gold Dust (Sparkles) */}
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
            
            // Luxury Particles
            return (
                <mesh key={item.id} position={item.positionTree} rotation={item.rotation} scale={item.scale} castShadow receiveShadow>
                    {/* Gem Geometry */}
                    {item.type === OrnamentType.GEM ? (
                        <icosahedronGeometry args={[0.7, 0]} /> // Faceted Jewel
                    ) : (
                        <octahedronGeometry args={[0.6, 0]} /> // Diamond shape
                    )}
                    
                    {/* PBR Material for maximum bling */}
                    <meshPhysicalMaterial 
                        color={item.color} 
                        metalness={1.0} 
                        roughness={0.15}
                        clearcoat={1.0}
                        clearcoatRoughness={0.1}
                        envMapIntensity={2.5} // High reflection
                        emissive={item.color}
                        emissiveIntensity={0.2} // Slight inner glow
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

      {/* 5. Cinematic Post Processing */}
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom 
            luminanceThreshold={0.7} // Only brightest highlights bloom
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

export default TreeScene;