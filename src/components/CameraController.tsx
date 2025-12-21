'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAirspaceStore } from '@/store/gameStore';

const MIN_CAMERA_DISTANCE = 1.05;
const DEFAULT_CAMERA_DISTANCE = 2.5;

function latLonToVector3(lat: number, lon: number, alt: number = 0): THREE.Vector3 {
  const r = 1 + alt * 0.0000005;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  
  const selectedId = useAirspaceStore((state) => state.gameState.selectedAircraft);
  const aircraft = useAirspaceStore((state) => state.aircraft);
  
  const isAnimating = useRef(false);
  const animationProgress = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const targetCameraPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const currentCameraOffset = useRef(new THREE.Vector3());
  
  const prevSelectedId = useRef<string | null>(null);
  const isReturningToEarth = useRef(false);
  
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedId.current) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft && controlsRef.current) {
        isAnimating.current = true;
        isReturningToEarth.current = false;
        animationProgress.current = 0;
        
        startPosition.current.copy(camera.position);
        startTarget.current.copy(controlsRef.current.target);
        
        const aircraftPos = latLonToVector3(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.altitude
        );
        
        const dirFromCenter = aircraftPos.clone().normalize();
        const cameraDistance = 0.3;
        const cameraPos = aircraftPos.clone().add(dirFromCenter.multiplyScalar(cameraDistance));
        
        targetCameraPos.current.copy(cameraPos);
        targetLookAt.current.copy(aircraftPos);
      }
    }
    
    if (!selectedId && prevSelectedId.current && controlsRef.current) {
      // Deselected - animate back to earth view
      isAnimating.current = true;
      isReturningToEarth.current = true;
      animationProgress.current = 0;
      
      startPosition.current.copy(camera.position);
      startTarget.current.copy(controlsRef.current.target);
      
      // Target: look at earth center from current direction but at default distance
      const currentDir = camera.position.clone().normalize();
      targetCameraPos.current.copy(currentDir.multiplyScalar(DEFAULT_CAMERA_DISTANCE));
      targetLookAt.current.set(0, 0, 0);
    }
    
    prevSelectedId.current = selectedId;
  }, [selectedId, aircraft, camera]);
  
  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    
    const selectedAircraft = selectedId ? aircraft.find(a => a.id === selectedId) : null;
    
    if (isAnimating.current) {
      animationProgress.current += delta * 1.5;
      const t = Math.min(animationProgress.current, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      
      camera.position.lerpVectors(startPosition.current, targetCameraPos.current, eased);
      currentTarget.current.lerpVectors(startTarget.current, targetLookAt.current, eased);
      controlsRef.current.target.copy(currentTarget.current);
      
      if (t >= 1) {
        isAnimating.current = false;
        if (selectedAircraft && !isReturningToEarth.current) {
          const aircraftPos = latLonToVector3(
            selectedAircraft.position.latitude,
            selectedAircraft.position.longitude,
            selectedAircraft.position.altitude
          );
          currentCameraOffset.current.copy(camera.position).sub(aircraftPos);
        }
        isReturningToEarth.current = false;
      }
    } else if (selectedAircraft) {
      const aircraftPos = latLonToVector3(
        selectedAircraft.position.latitude,
        selectedAircraft.position.longitude,
        selectedAircraft.position.altitude
      );
      
      const targetPos = aircraftPos.clone().add(currentCameraOffset.current);
      camera.position.lerp(targetPos, delta * 3);
      
      currentTarget.current.lerp(aircraftPos, delta * 5);
      controlsRef.current.target.copy(currentTarget.current);
    } else {
      const distFromCenter = camera.position.length();
      if (distFromCenter < MIN_CAMERA_DISTANCE) {
        camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
      }
    }
    
    controlsRef.current.update();
  });
  
  const handleControlsChange = () => {
    if (selectedId && !isAnimating.current) {
      const selectedAircraft = aircraft.find(a => a.id === selectedId);
      if (selectedAircraft) {
        const aircraftPos = latLonToVector3(
          selectedAircraft.position.latitude,
          selectedAircraft.position.longitude,
          selectedAircraft.position.altitude
        );
        currentCameraOffset.current.copy(camera.position).sub(aircraftPos);
      }
    }
  };
  
  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={0.15}
      maxDistance={5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      dampingFactor={0.1}
      enableDamping
      onChange={handleControlsChange}
    />
  );
}
