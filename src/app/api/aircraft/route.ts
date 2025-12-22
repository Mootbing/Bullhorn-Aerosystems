import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Rate limiting state
let lastRequestTime = 0;
let requestCount = 0;
let requestCountResetTime = Date.now();
const MIN_REQUEST_INTERVAL = 5000; // 5 seconds between requests
const MAX_REQUESTS_PER_MINUTE = 10; // Conservative limit

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function getCredentials(): Credentials | null {
  try {
    const credPath = path.join(process.cwd(), 'credentials.json');
    if (fs.existsSync(credPath)) {
      const data = fs.readFileSync(credPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[API] Failed to read credentials:', e);
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lamin = searchParams.get('lamin');
  const lamax = searchParams.get('lamax');
  const lomin = searchParams.get('lomin');
  const lomax = searchParams.get('lomax');

  // Rate limiting checks
  const now = Date.now();
  
  // Reset counter every minute
  if (now - requestCountResetTime > 60000) {
    requestCount = 0;
    requestCountResetTime = now;
  }
  
  // Check if we've exceeded requests per minute
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = Math.ceil((60000 - (now - requestCountResetTime)) / 1000);
    return NextResponse.json(
      { error: 'Rate limited', message: `Too many requests. Try again in ${waitTime}s`, retryAfter: waitTime },
      { status: 429 }
    );
  }
  
  // Check minimum interval between requests
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000);
    return NextResponse.json(
      { error: 'Rate limited', message: `Please wait ${waitTime}s between requests`, retryAfter: waitTime },
      { status: 429 }
    );
  }

  // Build OpenSky URL
  let url = 'https://opensky-network.org/api/states/all';
  if (lamin && lamax && lomin && lomax) {
    url += `?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;
  }

  // Get credentials for authentication
  const credentials = getCredentials();
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  
  if (credentials) {
    // Use Basic Auth with OpenSky credentials
    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
    console.log('[API] Using authenticated request');
  } else {
    console.log('[API] No credentials found, using anonymous request');
  }

  try {
    lastRequestTime = now;
    requestCount++;
    
    console.log(`[API] Fetching aircraft (request ${requestCount}/${MAX_REQUESTS_PER_MINUTE} this minute)`);
    
    const response = await fetch(url, { 
      headers,
      next: { revalidate: 10 } // Cache for 10 seconds
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'OpenSky rate limited', message: 'OpenSky API rate limit exceeded' },
          { status: 429 }
        );
      }
      if (response.status === 401) {
        console.warn('[API] Authentication failed - check credentials.json or create an OpenSky account');
        return NextResponse.json(
          { error: 'Authentication required', message: 'Please add OpenSky credentials to credentials.json' },
          { status: 401 }
        );
      }
      throw new Error(`OpenSky API error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`[API] Received ${data.states?.length || 0} aircraft`);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error fetching aircraft:', error);
    return NextResponse.json(
      { error: 'Failed to fetch aircraft data' },
      { status: 500 }
    );
  }
}

