'use client';

import dynamic from 'next/dynamic';
import { Dashboard } from '@/components/Dashboard';
import { DataPoller } from '@/components/DataPoller';

const Scene = dynamic(() => import('@/components/Scene').then((mod) => mod.Scene), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-black flex items-center justify-center font-mono">
      <div className="text-center">
        <div className="mb-4 text-[#333] text-xs tracking-[0.2em]">
          INITIALIZING SYSTEM
        </div>
        <div className="mt-4 text-[10px] text-[#444] tracking-[0.15em]">
          LOADING_AIRSPACE_MODULE...
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden bg-black">
      <Scene />
      <Dashboard />
      <DataPoller />
    </main>
  );
}
