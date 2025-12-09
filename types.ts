import * as THREE from 'three';

export enum AppMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  FOCUS = 'FOCUS',
}

export enum OrnamentType {
  GEM = 'GEM',     // Renamed from SPHERE/CUBE to GEM for semantic clarity
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
  textureUrl?: string; // Only for photos
}

export interface GestureState {
  isHandDetected: boolean;
  gesture: 'NONE' | 'OPEN_PALM' | 'CLOSED_FIST' | 'PINCH';
  handRotation: number; // -1 (left tilt) to 1 (right tilt), 0 is flat
}