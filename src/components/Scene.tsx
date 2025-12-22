'use client';

import { Canvas } from '@react-three/fiber';
import { Stars, PerspectiveCamera, AdaptiveDpr } from '@react-three/drei';
import { Globe } from './Globe';
import { CountryBorders } from './CountryBorders';
import { AircraftLayer } from './AircraftLayer';
import { AirportsLayer } from './AirportsLayer';
import { CameraController } from './CameraController';
import { ViewportTracker } from './ViewportTracker';
import { Suspense } from 'react';

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#000000" wireframe />
    </mesh>
  );
}

export function Scene() {
  return (
    <div className="w-screen h-screen absolute inset-0 overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 50 } }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#000000']} />
        <PerspectiveCamera makeDefault position={[0, 0, 2.5]} fov={60} />
        <AdaptiveDpr pixelated />
        <Stars radius={100} depth={50} count={2000} factor={3} saturation={0} fade speed={0.2} />
        <Suspense fallback={<LoadingFallback />}>
          <Globe />
          <CountryBorders />
          <AirportsLayer />
          <AircraftLayer />
        </Suspense>
        <CameraController />
        <ViewportTracker />
      </Canvas>
    </div>
  );
}
