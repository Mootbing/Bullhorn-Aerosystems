'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';

const EARTH_RADIUS = 1.002;
const GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

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
  const [lineSegments, setLineSegments] = useState<{ positions: Float32Array } | null>(null);

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
        
        setLineSegments({ positions: new Float32Array(allPoints) });
      })
      .catch(err => console.error('Failed to load country borders:', err));
  }, []);

  if (!lineSegments) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[lineSegments.positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </lineSegments>
  );
}
