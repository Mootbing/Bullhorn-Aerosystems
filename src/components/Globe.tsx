'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const EARTH_RADIUS = 1;

export function Globe() {
  const globeRef = useRef<THREE.Mesh>(null);
  
  const earthMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
          return v;
        }
        
        void main() {
          vec2 uv = vUv * vec2(4.0, 2.0);
          float land = smoothstep(0.45, 0.55, fbm(uv * 3.0 + vec2(1.5, 0.5)));
          vec3 ocean = vec3(0.01, 0.015, 0.02);
          vec3 landC = vec3(0.03, 0.035, 0.03);
          float grid = max(smoothstep(0.97, 1.0, abs(sin(vUv.y * 56.5))), smoothstep(0.97, 1.0, abs(sin(vUv.x * 113.0)))) * 0.08;
          vec3 color = mix(ocean, landC, land) + vec3(grid) * vec3(0.05, 0.1, 0.12);
          float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 4.0);
          color += rim * vec3(0.0, 0.05, 0.08) * 0.3;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, []);
  
  useFrame(() => {
    if (globeRef.current) globeRef.current.rotation.y += 0.0002;
  });
  
  return (
    <mesh ref={globeRef} material={earthMaterial}>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
    </mesh>
  );
}
