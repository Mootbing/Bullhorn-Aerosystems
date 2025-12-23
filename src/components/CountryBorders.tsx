'use client';

import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';
import { latLonToVector3 } from '@/utils/geo';

// ============================================================================
// COUNTRY BORDERS COMPONENT
// Draws animated country borders on the globe
// Fixed: Uses bundled GeoJSON, proper disposal
// ============================================================================

const EARTH_RADIUS = 1.002;
const DRAW_DURATION = 1.5; // seconds to fully draw borders

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
  
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const animationProgress = useRef(0);
  const animationStarted = useRef(false);

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
            
            const p1 = latLonToVector3(lat1, lon1, 0, EARTH_RADIUS);
            const p2 = latLonToVector3(lat2, lon2, 0, EARTH_RADIUS);
            
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
  
  // Create geometry and material when data is ready
  useEffect(() => {
    if (!lineData) return;
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(lineData.positions, 3));
    geometry.setDrawRange(0, 0); // Start hidden
    geometryRef.current = geometry;
    
    // Create material
    const material = new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
    });
    materialRef.current = material;
    
    // Cleanup on unmount
    return () => {
      geometry.dispose();
      material.dispose();
      geometryRef.current = null;
      materialRef.current = null;
    };
  }, [lineData]);
  
  // Animate draw range
  useFrame((_, delta) => {
    if (!geometryRef.current || !lineData) return;
    
    // Start animation when borders phase begins
    if (introPhase === 'borders' || introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationProgress.current = 0;
      }
    }
    
    if (!animationStarted.current) {
      geometryRef.current.setDrawRange(0, 0);
      return;
    }
    
    // Animate progress
    if (animationProgress.current < 1) {
      animationProgress.current = Math.min(1, animationProgress.current + delta / DRAW_DURATION);
      
      // Ease out cubic for smooth draw
      const eased = 1 - Math.pow(1 - animationProgress.current, 3);
      const vertexCount = Math.floor(eased * lineData.positions.length / 3);
      geometryRef.current.setDrawRange(0, vertexCount);
      
      // Also fade in opacity
      if (materialRef.current) {
        materialRef.current.opacity = eased * 0.6;
      }
    }
  });

  if (!lineData || !geometryRef.current || !materialRef.current) return null;

  return (
    <lineSegments geometry={geometryRef.current} material={materialRef.current} />
  );
}
