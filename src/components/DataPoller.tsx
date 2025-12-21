'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAirspaceStore } from '@/store/gameStore';

function generateMockData(count: number = 100) {
  const countries = ['United States', 'China', 'Germany', 'United Kingdom', 'France', 'Japan', 'Australia', 'Canada', 'Brazil', 'India'];
  const aircraft = [];
  for (let i = 0; i < count; i++) {
    const verticalRate = (Math.random() - 0.5) * 2000;
    aircraft.push({
      id: `${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
      callsign: `${['UAL', 'DAL', 'AAL', 'SWA', 'JBU', 'ASA', 'BAW', 'AFR', 'DLH', 'CCA'][Math.floor(Math.random() * 10)]}${Math.floor(Math.random() * 9999)}`,
      type: ['B737', 'A320', 'B777', 'A350', 'B380', 'E190'][Math.floor(Math.random() * 6)],
      position: {
        latitude: (Math.random() - 0.5) * 140,
        longitude: (Math.random() - 0.5) * 360,
        altitude: 25000 + Math.random() * 20000,
        heading: Math.random() * 360,
        speed: 400 + Math.random() * 200,
        verticalRate: verticalRate,
        geoAltitude: 25000 + Math.random() * 20000,
      },
      timestamp: Date.now(),
      originCountry: countries[Math.floor(Math.random() * countries.length)],
      onGround: false,
      squawk: Math.floor(Math.random() * 7777).toString().padStart(4, '0'),
      positionSource: 0,
      lastContact: Date.now() / 1000,
    });
  }
  return aircraft;
}

export function DataPoller() {
  const isPolling = useAirspaceStore((state) => state.isPolling);
  const setAircraft = useAirspaceStore((state) => state.setAircraft);
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const hasInitialized = useRef(false);
  
  const fetchData = useCallback(async () => {
    if (!isPolling) return;
    try {
      const res = await fetch('https://opensky-network.org/api/states/all', {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error('API error');
      const text = await res.text();
      if (!text || !text.startsWith('{')) throw new Error('Invalid JSON');
      const data = JSON.parse(text);
      if (data.states && data.states.length > 0) {
        // OpenSky state vector indices:
        // 0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact
        // 5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity
        // 10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk
        // 15: spi, 16: position_source
        const planes = data.states.filter((s: any[]) => s[5] != null && s[6] != null).slice(0, 400).map((s: any[]) => ({
          id: s[0],
          callsign: (s[1] || '').trim() || 'N/A',
          type: 'UNKNOWN',
          position: {
            longitude: s[5],
            latitude: s[6],
            altitude: (s[7] || 0) * 3.28084, // m to ft
            heading: s[10] || 0,
            speed: (s[9] || 0) * 1.94384, // m/s to kts
            verticalRate: (s[11] || 0) * 196.850, // m/s to ft/min
            geoAltitude: (s[13] || 0) * 3.28084,
          },
          timestamp: Date.now(),
          originCountry: s[2] || 'Unknown',
          onGround: s[8] || false,
          squawk: s[14] || null,
          spi: s[15] || false,
          positionSource: s[16] || 0,
          lastContact: s[4] || null,
        }));
        if (planes.length > 0) { setAircraft(planes); return; }
      }
      throw new Error('No data');
    } catch (e) {
      console.log('Using mock data');
      if (aircraft.length === 0) setAircraft(generateMockData());
    }
  }, [isPolling, setAircraft, aircraft.length]);
  
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      fetchData();
    }
  }, [fetchData]);
  
  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isPolling, fetchData]);
  
  return null;
}
