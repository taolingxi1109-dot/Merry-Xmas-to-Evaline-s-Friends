import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { COLORS } from '../constants.ts';

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
    toneMapped: false, // Keep photo colors vivid
  }), [texture]);

  const backingMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0x000000,
    metalness: 0.5,
    roughness: 0.8,
  }), []);

  // Calculate aspect ratio logic could go here, but keeping simple box for now
  const frameThickness = 0.05;
  const frameDepth = 0.1;
  const width = 1.2;
  const height = 1.6;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* 1. Main Photo Mesh */}
      <mesh position={[0, 0, frameDepth / 2 + 0.01]} material={photoMaterial}>
        <planeGeometry args={[width - frameThickness * 2, height - frameThickness * 2]} />
      </mesh>

      {/* 2. The Gold Frame (Borders) */}
      {/* Top */}
      <mesh position={[0, height / 2 - frameThickness / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[width, frameThickness, frameDepth]} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -height / 2 + frameThickness / 2, 0]} material={frameMaterial}>
        <boxGeometry args={[width, frameThickness, frameDepth]} />
      </mesh>
      {/* Left */}
      <mesh position={[-width / 2 + frameThickness / 2, 0, 0]} material={frameMaterial}>
        <boxGeometry args={[frameThickness, height - frameThickness * 2, frameDepth]} />
      </mesh>
      {/* Right */}
      <mesh position={[width / 2 - frameThickness / 2, 0, 0]} material={frameMaterial}>
        <boxGeometry args={[frameThickness, height - frameThickness * 2, frameDepth]} />
      </mesh>

      {/* 3. Backing Plate (Luxury Finish) */}
      <mesh position={[0, 0, -0.01]} material={backingMaterial}>
        <boxGeometry args={[width, height, 0.02]} />
      </mesh>
      
      {/* 4. Glow Logic for Focus Mode */}
      {isFocused && (
        <pointLight distance={3} intensity={2} color={COLORS.GOLD_PURE} />
      )}
    </group>
  );
};

export default PhotoFrame;