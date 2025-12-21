'use client';

import { useEffect, useState, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const EARTH_RADIUS = 1;
const GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelinis/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

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
  features: GeoJSONFeature[];
}

export function CountryBorders() {
  const [borders, setBorders] = useState<THREE.Vector3[][]>([]);

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then((data: GeoJSONData) => {
        const lines: THREE.Vector3[][] = [];
        
        data.features.forEach((feature) => {
          const { type, coordinates } = feature.geometry;
          
          if (type === 'Polygon') {
            (coordinates as number[][][]).forEach((ring) => {
              const points = ring.map(([lon, lat]) => latLonToVector3(lat, lon, 1.001));
              if (points.length > 2) lines.push(points);
            });
          } else if (type === 'MultiPolygon') {
            (coordinates as number[][][][]).forEach((polygon) => {
              polygon.forEach((ring) => {
                const points = ring.map(([lon, lat]) => latLonToVector3(lat, lon, 1.001));
                if (points.length > 2) lines.push(points);
              });
            });
          }
        });
        
        setBorders(lines);
      })
      .catch(err => console.error('Failed to load country borders:', err));
  }, []);

  return (
    <group>
      {borders.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#ffffff"
          lineWidth={0.5}
          transparent
          opacity={0.15}
        />
      ))}
    </group>
  );
}
