import { NextRequest, NextResponse } from 'next/server';

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevation: number;
  type: 'large_airport' | 'medium_airport' | 'small_airport' | 'heliport' | 'seaplane_base' | 'closed';
  scheduled_service: boolean;
}

// Cache airports in memory after first fetch
let cachedAirports: Airport[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function fetchAirportsFromSource(): Promise<Airport[]> {
  // Use OurAirports data (public domain CSV converted to usable format)
  // This is a curated list of major airports from the OurAirports database
  const response = await fetch(
    'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
    { next: { revalidate: 86400 } } // Cache for 24 hours
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch airport data');
  }
  
  const csvText = await response.text();
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const airports: Airport[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Parse CSV properly (handle quoted fields)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    
    const type = row['type'] as Airport['type'];
    const icao = row['ident'] || '';
    const iata = row['iata_code'] || '';
    const lat = parseFloat(row['latitude_deg']);
    const lon = parseFloat(row['longitude_deg']);
    
    // Only include airports with valid coordinates and meaningful types
    if (
      !isNaN(lat) && !isNaN(lon) &&
      ['large_airport', 'medium_airport', 'small_airport'].includes(type) &&
      row['scheduled_service'] === 'yes'
    ) {
      airports.push({
        icao,
        iata,
        name: row['name'] || '',
        city: row['municipality'] || '',
        country: row['iso_country'] || '',
        lat,
        lon,
        elevation: parseFloat(row['elevation_ft']) || 0,
        type,
        scheduled_service: row['scheduled_service'] === 'yes',
      });
    }
  }
  
  return airports;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bounds = searchParams.get('bounds'); // "minLat,maxLat,minLon,maxLon"
    const types = searchParams.get('types')?.split(',') || ['large_airport', 'medium_airport', 'small_airport'];
    
    // Check cache
    if (!cachedAirports || Date.now() - cacheTime > CACHE_DURATION) {
      cachedAirports = await fetchAirportsFromSource();
      cacheTime = Date.now();
      console.log(`[Airports API] Loaded ${cachedAirports.length} airports`);
    }
    
    let airports = cachedAirports;
    
    // Filter by type
    airports = airports.filter(a => types.includes(a.type));
    
    // Filter by bounds if provided
    if (bounds) {
      const [minLat, maxLat, minLon, maxLon] = bounds.split(',').map(Number);
      airports = airports.filter(a => 
        a.lat >= minLat && a.lat <= maxLat &&
        a.lon >= minLon && a.lon <= maxLon
      );
    }
    
    return NextResponse.json({
      airports,
      total: airports.length,
      cached: Date.now() - cacheTime < 1000, // Was this from cache?
    });
    
  } catch (error) {
    console.error('[Airports API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch airports', airports: [], total: 0 },
      { status: 500 }
    );
  }
}

