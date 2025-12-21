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
- onGround: Whether aircraft is on ground (boolean)
- squawk: Transponder squawk code

Common patterns to recognize:
- "flights from X to Y" - Look for callsigns or origins matching X, destinations are not in our data
- "above/below X feet" - altitude filters
- "faster/slower than X knots" - speed filters
- "heading north/south/east/west" - heading ranges (N: 315-45, E: 45-135, S: 135-225, W: 225-315)
- Country names - match to originCountry
- Airline codes (UAL, DAL, AAL, etc.) - partial match callsign
- City names - might be in callsign or interpret as origin region

Return JSON with this structure:
{
  "filters": [
    { "field": "fieldName", "operator": "equals|contains|gt|lt|between", "value": "value or number or [min,max]" }
  ],
  "freeText": ["words", "to", "match", "anywhere"]
}

Examples:
- "United flights" -> { "filters": [{ "field": "callsign", "operator": "contains", "value": "UAL" }], "freeText": [] }
- "above 30000 feet" -> { "filters": [{ "field": "altitude", "operator": "gt", "value": 30000 }], "freeText": [] }
- "flights from Germany" -> { "filters": [{ "field": "originCountry", "operator": "contains", "value": "Germany" }], "freeText": [] }
- "SWR18P" -> { "filters": [{ "field": "callsign", "operator": "contains", "value": "SWR18P" }], "freeText": ["SWR18P"] }`;

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

