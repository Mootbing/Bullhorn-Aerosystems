'use client';

import dynamic from 'next/dynamic';
import { Dashboard } from '@/components/Dashboard';
import { DataPoller } from '@/components/DataPoller';
import { useRadarStore } from '@/store/gameStore';
import { useState, useEffect } from 'react';

const Scene = dynamic(() => import('@/components/Scene').then((mod) => mod.Scene), {
  ssr: false,
  loading: () => null, // We handle loading ourselves
});

const LOADING_STAGES = [
  { text: 'ESTABLISHING_SECURE_CONNECTION', duration: 400 },
  { text: 'AUTHENTICATING_CLEARANCE_LEVEL', duration: 350 },
  { text: 'LOADING_SATELLITE_IMAGERY', duration: 500 },
  { text: 'CALIBRATING_RADAR_SYSTEMS', duration: 450 },
  { text: 'SYNCHRONIZING_FLIGHT_DATA', duration: 400 },
  { text: 'ACQUIRING_GPS_COORDINATES', duration: 600 },
  { text: 'INITIALIZING_TRACKING_MATRIX', duration: 350 },
  { text: 'SYSTEM_READY', duration: 300 },
];

// Intro animation timing (ms)
const INTRO_TIMING = {
  BORDERS_DELAY: 200,      // Start borders after loading fade begins
  BORDERS_DURATION: 800,   // How long borders take to draw
  AIRPORTS_DELAY: 600,     // Start airports after borders begin
  AIRPORTS_DURATION: 600,  // How long airports take to appear
  AIRCRAFT_DELAY: 1000,    // Start aircraft after airports begin
  AIRCRAFT_DURATION: 800,  // How long aircraft fly-in takes
};

function LoadingOverlay() {
  const locationReady = useRadarStore((s) => s.locationReady);
  const setIntroPhase = useRadarStore((s) => s.setIntroPhase);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  
  // Trigger intro animation phases when loading completes
  useEffect(() => {
    if (!locationReady) return;
    
    // Start borders animation
    const bordersTimer = setTimeout(() => {
      setIntroPhase('borders');
    }, INTRO_TIMING.BORDERS_DELAY);
    
    // Start airports animation
    const airportsTimer = setTimeout(() => {
      setIntroPhase('airports');
    }, INTRO_TIMING.BORDERS_DELAY + INTRO_TIMING.AIRPORTS_DELAY);
    
    // Start aircraft animation
    const aircraftTimer = setTimeout(() => {
      setIntroPhase('aircraft');
    }, INTRO_TIMING.BORDERS_DELAY + INTRO_TIMING.AIRPORTS_DELAY + INTRO_TIMING.AIRCRAFT_DELAY);
    
    // Complete animation
    const completeTimer = setTimeout(() => {
      setIntroPhase('complete');
    }, INTRO_TIMING.BORDERS_DELAY + INTRO_TIMING.AIRPORTS_DELAY + INTRO_TIMING.AIRCRAFT_DELAY + INTRO_TIMING.AIRCRAFT_DURATION);
    
    return () => {
      clearTimeout(bordersTimer);
      clearTimeout(airportsTimer);
      clearTimeout(aircraftTimer);
      clearTimeout(completeTimer);
    };
  }, [locationReady, setIntroPhase]);
  
  // Cycle through loading stages
  useEffect(() => {
    if (locationReady) return;
    
    const stage = LOADING_STAGES[stageIndex];
    if (!stage) return;
    
    const timer = setTimeout(() => {
      if (stageIndex < LOADING_STAGES.length - 1) {
        setStageIndex(prev => prev + 1);
      }
    }, stage.duration);
    
    return () => clearTimeout(timer);
  }, [stageIndex, locationReady]);
  
  // Animate progress
  useEffect(() => {
    if (locationReady) return;
    
    const interval = setInterval(() => {
      setProgress(prev => {
        // Progress based on stage index with some randomness
        const targetProgress = ((stageIndex + 1) / LOADING_STAGES.length) * 100;
        const jitter = Math.random() * 3 - 1;
        const newProgress = prev + (targetProgress - prev) * 0.15 + jitter;
        return Math.min(Math.max(newProgress, prev), 99);
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [stageIndex, locationReady]);
  
  // Set progress to 100 when location is ready (computed value, not in effect)
  const displayProgress = locationReady ? 100 : progress;
  
  const currentStage = LOADING_STAGES[stageIndex] || LOADING_STAGES[LOADING_STAGES.length - 1];
  
  return (
    <div 
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center font-mono transition-opacity duration-700 pointer-events-none ${
        locationReady ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDelay: locationReady ? '200ms' : '0ms' }}
    >
      <div className="relative" style={{ width: '320px', height: '70px' }}>
        {/* Commercial edition label - top */}
        <div className="absolute top-0 left-0 right-0 text-center text-[10px] text-[#555] tracking-[0.15em]">
          COMMERCIAL EDITION
        </div>
        
        {/* Main title with reveal effect - absolutely positioned */}
        <div className="absolute top-5 left-0 right-0 text-center">
          <div className="relative inline-block text-sm tracking-[0.25em] font-light">
            {/* Grey background text */}
            <span className="text-[#333] whitespace-nowrap">
              BULLHORN AEROSYSTEMS
            </span>
            {/* White overlay that reveals left to right */}
            <div 
              className="absolute top-0 left-0 text-white overflow-hidden whitespace-nowrap"
              style={{ width: `${displayProgress}%` }}
            >
              BULLHORN AEROSYSTEMS
            </div>
          </div>
        </div>
        
        {/* Status line: stage text - percentage - absolutely positioned */}
        <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-[#555] tracking-[0.15em]">
          {currentStage.text} — {Math.floor(displayProgress)}%
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden bg-black">
      <Scene />
      <Dashboard />
      <DataPoller />
      <LoadingOverlay />
    </main>
  );
}
