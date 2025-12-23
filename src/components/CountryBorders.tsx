'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';
import { latLonToVector3 } from '@/utils/geo';
import { GLOBE, BORDERS, COLORS } from '@/config/constants';

// ============================================================================
// COUNTRY BORDERS COMPONENT
// Draws animated country borders on the globe
// Fixed: Uses bundled GeoJSON, proper disposal
// ============================================================================

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}

export function CountryBorders() {
  const [lineData, setLineData] = useState<{ positions: Float32Array; totalSegments: number } | null>(null);
  const introPhase = useRadarStore((s) => s.introPhase);
  const loadingProgress = useRadarStore((s) => s.loadingProgress);
  
  const fadeStartTime = useRef<number | null>(null);

  // Load bundled GeoJSON on mount
  useEffect(() => {
    let cancelled = false;
    
    // Use bundled local file instead of external URL
    fetch('/countries.geo.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch country borders');
        return res.json();
      })
      .then((data: GeoJSONData) => {
        if (cancelled) return;
        
        const allPoints: number[] = [];
        
        const processRing = (ring: number[][]) => {
          for (let i = 0; i < ring.length - 1; i++) {
            const [lon1, lat1] = ring[i];
            const [lon2, lat2] = ring[i + 1];
            
            const p1 = latLonToVector3(lat1, lon1, 0, GLOBE.BORDER_SURFACE_OFFSET);
            const p2 = latLonToVector3(lat2, lon2, 0, GLOBE.BORDER_SURFACE_OFFSET);
            
            allPoints.push(p1.x, p1.y, p1.z);
            allPoints.push(p2.x, p2.y, p2.z);
          }
        };
        
        data.features.forEach((feature) => {
          const { type, coordinates } = feature.geometry;
          
          if (type === 'Polygon') {
            (coordinates as number[][][]).forEach(processRing);
          } else if (type === 'MultiPolygon') {
            (coordinates as number[][][][]).forEach((polygon) => {
              polygon.forEach(processRing);
            });
          }
        });
        
        const totalSegments = allPoints.length / 6;
        setLineData({ positions: new Float32Array(allPoints), totalSegments });
      })
      .catch(err => console.error('Failed to load country borders:', err));
    
    return () => {
      cancelled = true;
    };
  }, []);
  
  // Create geometry and material when data is ready - useMemo for stable references
  const threeObjects = useMemo(() => {
    if (!lineData) return null;
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(lineData.positions, 3));
    geometry.setDrawRange(0, 0); // Start hidden
    
    // Create material
    const material = new THREE.LineBasicMaterial({
      color: COLORS.BORDERS_LINE,
      transparent: true,
      opacity: 0,
    });
    
    return { geometry, material };
  }, [lineData]);
  
  // Cleanup geometry and material on unmount
  useEffect(() => {
    return () => {
      if (threeObjects) {
        threeObjects.geometry.dispose();
        threeObjects.material.dispose();
      }
    };
  }, [threeObjects]);
  
  // Animate draw range synced to loading progress
  useFrame((state) => {
    if (!threeObjects || !lineData) return;
    
    const { geometry, material } = threeObjects;
    
    // Only animate when borders phase is active
    if (introPhase !== 'borders' && introPhase !== 'airports' && introPhase !== 'aircraft' && introPhase !== 'complete') {
      geometry.setDrawRange(0, 0);
      return;
    }
    
    // Use loading progress directly (0-100 → 0-1)
    const progress = Math.min(1, loadingProgress / 100);
    
    // Ease out cubic for smooth draw
    const eased = 1 - Math.pow(1 - progress, 3);
    const vertexCount = Math.floor(eased * lineData.positions.length / 3);
    geometry.setDrawRange(0, vertexCount);
    
    // Two-phase opacity: 10% while drawing, then fade to 50% after complete
    // Three.js objects are intentionally mutable in useFrame
    /* eslint-disable react-hooks/immutability */
    if (progress < 1) {
      // Drawing phase: keep at low opacity
      material.opacity = BORDERS.DRAW_OPACITY;
      fadeStartTime.current = null;
    } else {
      // Drawing complete: fade from DRAW_OPACITY to FINAL_OPACITY
      if (fadeStartTime.current === null) {
        fadeStartTime.current = state.clock.elapsedTime;
      }
      
      const fadeElapsed = state.clock.elapsedTime - fadeStartTime.current;
      const fadeProgress = Math.min(1, fadeElapsed / BORDERS.FADE_IN_DURATION);
      
      // Ease out for smooth fade
      const fadeEased = 1 - Math.pow(1 - fadeProgress, 2);
      material.opacity = BORDERS.DRAW_OPACITY + (BORDERS.FINAL_OPACITY - BORDERS.DRAW_OPACITY) * fadeEased;
    }
    /* eslint-enable react-hooks/immutability */
  });

  if (!threeObjects) return null;

  return (
    <lineSegments geometry={threeObjects.geometry} material={threeObjects.material} />
  );
}
