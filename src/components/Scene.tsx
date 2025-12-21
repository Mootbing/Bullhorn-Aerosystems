'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei';
import { Globe } from './Globe';
import { AircraftLayer } from './AircraftLayer';
import { Suspense } from 'react';

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#0a0a0a" wireframe />
    </mesh>
  );
}

export function Scene() {
  return (
    <div className="w-full h-full absolute inset-0">
      <Canvas gl={{ antialias: true, alpha: false }} dpr={[1, 2]}>
        <color attach="background" args={['#000000']} />
        <PerspectiveCamera makeDefault position={[0, 0, 2.5]} fov={60} />
        <ambientLight intensity={0.05} />
        <directionalLight position={[5, 3, 5]} intensity={0.3} />
        <Stars radius={100} depth={50} count={2000} factor={3} saturation={0} fade speed={0.2} />
        <Suspense fallback={<LoadingFallback />}>
          <Globe />
          <AircraftLayer />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={1.3} maxDistance={5} rotateSpeed={0.5} zoomSpeed={0.8} dampingFactor={0.1} enableDamping />
      </Canvas>
    </div>
  );
}
