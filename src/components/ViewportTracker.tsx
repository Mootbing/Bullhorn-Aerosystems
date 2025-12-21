'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';

// Convert 3D position on globe to lat/lon
function vector3ToLatLon(position: THREE.Vector3): { lat: number; lon: number } | null {
  const r = position.length();
  if (r < 0.001) return null;
  
  const normalized = position.clone().normalize();
  const lat = 90 - Math.acos(normalized.y) * (180 / Math.PI);
  const lon = Math.atan2(normalized.z, -normalized.x) * (180 / Math.PI) - 180;
  
  return { lat, lon: ((lon + 540) % 360) - 180 }; // Normalize lon to -180 to 180
}

export function ViewportTracker() {
  const { camera, size } = useThree();
  const setViewportBounds = useRadarStore((state) => state.setViewportBounds);
  
  const lastUpdate = useRef(0);
  const lastBounds = useRef<string>('');
  const raycaster = useRef(new THREE.Raycaster());
  const globeSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1));
  // Force recalculation when viewport size changes
  useEffect(() => {
    lastBounds.current = ''; // Reset to force update on next frame
    lastUpdate.current = 0;
  }, [size.width, size.height]);
  
  useFrame((state) => {
    // Throttle updates to every 200ms
    const now = state.clock.elapsedTime;
    if (now - lastUpdate.current < 0.2) return;
    lastUpdate.current = now;
    
    // Calculate camera distance from globe center (zoom level)
    const cameraDistance = camera.position.length();
    const zoomLevel = Math.min(1, Math.max(0, (cameraDistance - 1.05) / 4)); // 0 = close, 1 = far
    
    // Get the center point the camera is looking at
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    raycaster.current.set(camera.position, cameraDir);
    
    const intersectPoint = new THREE.Vector3();
    const hasIntersection = raycaster.current.ray.intersectSphere(globeSphere.current, intersectPoint);
    
    let centerLat = 0;
    let centerLon = 0;
    
    if (hasIntersection) {
      const center = vector3ToLatLon(intersectPoint);
      if (center) {
        centerLat = center.lat;
        centerLon = center.lon;
      }
    } else {
      // Camera looking away from globe, use camera position direction
      const posOnGlobe = vector3ToLatLon(camera.position);
      if (posOnGlobe) {
        centerLat = posOnGlobe.lat;
        centerLon = posOnGlobe.lon;
      }
    }
    
    // Calculate viewport size based on camera distance
    // Closer = smaller viewport, farther = larger viewport
    // At distance 1.05 (city zoom), we see about 15 degrees
    // At distance 1.15, we see about 20 degrees
    // At distance 5, we see the whole globe (180 degrees)
    const viewAngle = Math.min(180, 15 + (cameraDistance - 1) * 45);
    
    const latSpan = Math.min(90, viewAngle / 2);
    const lonSpan = Math.min(180, viewAngle);
    
    const minLat = Math.max(-90, centerLat - latSpan);
    const maxLat = Math.min(90, centerLat + latSpan);
    const minLon = centerLon - lonSpan;
    const maxLon = centerLon + lonSpan;
    
    // Create bounds string for comparison
    const boundsKey = `${minLat.toFixed(1)},${maxLat.toFixed(1)},${minLon.toFixed(1)},${maxLon.toFixed(1)}`;
    
    // Only update if bounds changed significantly
    if (boundsKey !== lastBounds.current) {
      lastBounds.current = boundsKey;
      setViewportBounds({
        minLat,
        maxLat,
        minLon,
        maxLon,
        centerLat,
        centerLon,
        zoomLevel,
      });
    }
  });
  
  return null;
}

