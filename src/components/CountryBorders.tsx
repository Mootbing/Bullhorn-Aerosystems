'use client';

import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRadarStore } from '@/store/gameStore';

const EARTH_RADIUS = 1.002;
const GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
const DRAW_DURATION = 0.8; // seconds to fully draw borders

function latLonToVector3(lat: number, lon: number, radius: number = EARTH_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

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
  const [lineSegments, setLineSegments] = useState<{ positions: Float32Array; totalSegments: number } | null>(null);
  const introPhase = useRadarStore((s) => s.introPhase);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const animationProgress = useRef(0);
  const animationStarted = useRef(false);

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data: GeoJSONData) => {
        const allPoints: number[] = [];
        
        const processRing = (ring: number[][]) => {
          for (let i = 0; i < ring.length - 1; i++) {
            const [lon1, lat1] = ring[i];
            const [lon2, lat2] = ring[i + 1];
            
            const p1 = latLonToVector3(lat1, lon1);
            const p2 = latLonToVector3(lat2, lon2);
            
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
        
        const totalSegments = allPoints.length / 6; // Each segment has 2 points * 3 coords
        setLineSegments({ positions: new Float32Array(allPoints), totalSegments });
      })
      .catch(err => console.error('Failed to load country borders:', err));
  }, []);
  
  // Animate draw range
  useFrame((_, delta) => {
    if (!geometryRef.current || !lineSegments) return;
    
    // Start animation when borders phase begins
    if (introPhase === 'borders' || introPhase === 'airports' || introPhase === 'aircraft' || introPhase === 'complete') {
      if (!animationStarted.current) {
        animationStarted.current = true;
        animationProgress.current = 0;
      }
    }
    
    if (!animationStarted.current) {
      // Before animation, show nothing
      geometryRef.current.setDrawRange(0, 0);
      return;
    }
    
    // Animate progress
    if (animationProgress.current < 1) {
      animationProgress.current = Math.min(1, animationProgress.current + delta / DRAW_DURATION);
      
      // Ease out cubic for smooth draw
      const eased = 1 - Math.pow(1 - animationProgress.current, 3);
      const vertexCount = Math.floor(eased * lineSegments.positions.length / 3);
      geometryRef.current.setDrawRange(0, vertexCount);
      
      // Also fade in opacity
      if (materialRef.current) {
        materialRef.current.opacity = eased * 0.6;
      }
    }
  });

  if (!lineSegments) return null;

  return (
    <lineSegments>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[lineSegments.positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial ref={materialRef} color="#ffffff" transparent opacity={0} />
    </lineSegments>
  );
}
