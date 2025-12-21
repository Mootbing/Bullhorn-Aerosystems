'use client';

import { useAirspaceStore } from '@/store/gameStore';
import { AircraftDot } from './AircraftDot';

export function AircraftLayer() {
  const aircraft = useAirspaceStore((state) => state.aircraft);
  const selectAircraft = useAirspaceStore((state) => state.selectAircraft);
  
  return (
    <group>
      {aircraft.map((ac) => (
        <AircraftDot key={ac.id} aircraft={ac} onClick={() => selectAircraft(ac.id)} />
      ))}
    </group>
  );
}
