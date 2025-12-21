'use client';

import { useEffect, useCallback } from 'react';
import { useAirspaceStore } from '@/store/gameStore';

function generateMockData(count: number = 80) {
  const aircraft = [];
  for (let i = 0; i < count; i++) {
    aircraft.push({
      id: `MOCK${i.toString().padStart(4, '0')}`,
      callsign: `${['UAL', 'DAL', 'AAL', 'SWA'][Math.floor(Math.random() * 4)]}${Math.floor(Math.random() * 9999)}`,
      type: 'B737',
      position: {
        latitude: (Math.random() - 0.5) * 140,
        longitude: (Math.random() - 0.5) * 360,
        altitude: 25000 + Math.random() * 20000,
        heading: Math.random() * 360,
        speed: 400 + Math.random() * 200,
      },
      timestamp: Date.now(),
    });
  }
  return aircraft;
}

export function DataPoller() {
  const isPolling = useAirspaceStore((state) => state.isPolling);
  const setAircraft = useAirspaceStore((state) => state.setAircraft);
  const aircraft = useAirspaceStore((state) => state.aircraft);
  
  const fetchData = useCallback(async () => {
    if (!isPolling) return;
    try {
      const res = await fetch('https://opensky-network.org/api/states/all');
      if (res.ok) {
        const data = await res.json();
        if (data.states) {
          const planes = data.states.filter((s: any[]) => s[5] && s[6]).slice(0, 200).map((s: any[]) => ({
            id: s[0],
            callsign: (s[1] || 'UNKNOWN').trim(),
            type: 'UNKNOWN',
            position: { longitude: s[5], latitude: s[6], altitude: (s[7] || 0) * 3.28084, heading: s[10] || 0, speed: (s[9] || 0) * 1.94384 },
            timestamp: Date.now(),
          }));
          if (planes.length > 0) { setAircraft(planes); return; }
        }
      }
    } catch (e) { console.log('API error, using mock'); }
    if (aircraft.length === 0) setAircraft(generateMockData());
  }, [isPolling, setAircraft, aircraft.length]);
  
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isPolling, fetchData]);
  
  return null;
}
