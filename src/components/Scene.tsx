'use client';

import { Canvas } from '@react-three/fiber';
import { Stars, PerspectiveCamera } from '@react-three/drei';
import { Globe } from './Globe';
import { CountryBorders } from './CountryBorders';
import { AircraftLayer } from './AircraftLayer';
import { CameraController } from './CameraController';
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
    <div className="w-screen h-screen absolute inset-0">
      <Canvas gl={{ antialias: true, alpha: false }} dpr={[1, 2]}>
        <color attach="background" args={['#000000']} />
        <PerspectiveCamera makeDefault position={[0, 0, 2.5]} fov={60} />
        <Stars radius={100} depth={50} count={2000} factor={3} saturation={0} fade speed={0.2} />
        <Suspense fallback={<LoadingFallback />}>
          <Globe />
          <CountryBorders />
          <AircraftLayer />
        </Suspense>
        <CameraController />
      </Canvas>
    </div>
  );
}
