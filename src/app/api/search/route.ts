import { NextRequest, NextResponse } from 'next/server';

interface SearchQuery {
  query: string;
  aircraftFields: string[];
}

interface ParsedSearch {
  filters: {
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'between';
    value: string | number | [number, number];
  }[];
  freeText: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { query, aircraftFields }: SearchQuery = await request.json();
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ filters: [], freeText: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      // Fallback to simple text matching if no API key
      return NextResponse.json({
        filters: [],
        freeText: query.split(/\s+/).filter(Boolean),
        fallback: true,
      });
    }

    const systemPrompt = `You are a flight search query parser. Parse natural language queries about aircraft/flights into structured filters.

Available fields to filter on:
- callsign: The flight callsign (e.g., "UAL123", "DAL456")
- id: ICAO24 hex identifier
- originCountry: Country of origin (e.g., "United States", "Germany")
- altitude: Altitude in feet (number)
- speed: Ground speed in knots (number)
- heading: Track heading in degrees (0-360)
- latitude: Latitude in degrees (-90 to 90)
- longitude: Longitude in degrees (-180 to 180)
- onGround: Whether aircraft is on ground (boolean)
- squawk: Transponder squawk code

ALTITUDE PATTERNS - Parse carefully:
- "20k ft" or "20K feet" = 20000 feet
- "35k" = 35000 feet
- "FL350" or "flight level 350" = 35000 feet (FL × 100)
- "above/over 20000 feet" -> altitude gt 20000
- "below/under 10000 feet" -> altitude lt 10000
- "between 20k and 40k" -> altitude between [20000, 40000]
- "high altitude" -> altitude gt 30000
- "low altitude" -> altitude lt 10000
- "cruising altitude" -> altitude between [30000, 42000]

HEADING/DIRECTION/TRACK PATTERNS:
- "heading" and "track" are synonyms - both refer to the direction the aircraft is flying
- "heading north" or "northbound" or "track north" -> heading between [315, 45]
- "heading south" or "southbound" or "track south" -> heading between [135, 225]
- "heading east" or "eastbound" or "track east" -> heading between [45, 135]
- "heading west" or "westbound" or "track west" -> heading between [225, 315]
- "heading northeast" -> heading between [22, 68]
- "heading northwest" -> heading between [292, 338]
- "heading southeast" -> heading between [112, 158]
- "heading southwest" -> heading between [202, 248]
- "track 311" or "heading 311" -> heading equals 311 (or between [306, 316] for approximate match)
- Specific degree values: "track 270", "heading 090" -> match that heading ±5 degrees

LOCATION/GEOGRAPHIC PATTERNS:
- "near equator" or "equatorial" -> latitude between [-10, 10]
- "northern hemisphere" -> latitude gt 0
- "southern hemisphere" -> latitude lt 0
- "over atlantic" -> longitude between [-60, -10]
- "over pacific" -> longitude between [140, 180] OR between [-180, -120]
- "over europe" -> latitude between [35, 70], longitude between [-10, 40]
- "over usa" or "over united states" -> latitude between [25, 50], longitude between [-125, -65]
- "polar" or "arctic" -> latitude gt 66 OR latitude lt -66
- "tropical" -> latitude between [-23, 23]

SPEED PATTERNS:
- "fast" or "high speed" -> speed gt 500
- "slow" -> speed lt 300
- "supersonic" -> speed gt 660

AIRLINE CODES (map to callsign contains):
- United/UAL, Delta/DAL, American/AAL, Southwest/SWA, JetBlue/JBU, Alaska/ASA
- British Airways/BAW, Air France/AFR, Lufthansa/DLH, KLM/KLM
- Emirates/UAE, Qatar/QTR, Singapore/SIA, Cathay/CPA

Return JSON with this structure:
{
  "filters": [
    { "field": "fieldName", "operator": "equals|contains|gt|lt|between", "value": "value or number or [min,max]" }
  ],
  "freeText": ["words", "to", "match", "anywhere"]
}

Examples:
- "flights above 20k ft" -> { "filters": [{ "field": "altitude", "operator": "gt", "value": 20000 }], "freeText": [] }
- "heading north" -> { "filters": [{ "field": "heading", "operator": "between", "value": [315, 45] }], "freeText": [] }
- "flights near equator" -> { "filters": [{ "field": "latitude", "operator": "between", "value": [-10, 10] }], "freeText": [] }
- "United flights above 35000" -> { "filters": [{ "field": "callsign", "operator": "contains", "value": "UAL" }, { "field": "altitude", "operator": "gt", "value": 35000 }], "freeText": [] }
- "fast flights heading west" -> { "filters": [{ "field": "speed", "operator": "gt", "value": 500 }, { "field": "heading", "operator": "between", "value": [225, 315] }], "freeText": [] }
- "flights from Germany" -> { "filters": [{ "field": "originCountry", "operator": "contains", "value": "Germany" }], "freeText": [] }
- "FL350 and above" -> { "filters": [{ "field": "altitude", "operator": "gt", "value": 35000 }], "freeText": [] }`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this flight search query: "${query}"` },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        filters: [],
        freeText: query.split(/\s+/).filter(Boolean),
      });
    }

    const parsed: ParsedSearch = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Search API error:', error);
    // Fallback to simple text search
    const { query } = await request.json().catch(() => ({ query: '' }));
    return NextResponse.json({
      filters: [],
      freeText: query?.split(/\s+/).filter(Boolean) || [],
      error: true,
    });
  }
}

