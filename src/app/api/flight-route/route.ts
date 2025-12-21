import { NextRequest, NextResponse } from 'next/server';

interface FlightRoute {
  departure: {
    airport: string;
    time: string | null;
  };
  arrival: {
    airport: string;
    time: string | null;
  };
  status: 'found' | 'estimated' | 'unknown';
}

// Common airline ICAO codes to names
const AIRLINE_CODES: Record<string, string> = {
  'UAL': 'United',
  'DAL': 'Delta',
  'AAL': 'American',
  'SWA': 'Southwest',
  'JBU': 'JetBlue',
  'ASA': 'Alaska',
  'BAW': 'British Airways',
  'AFR': 'Air France',
  'DLH': 'Lufthansa',
  'KLM': 'KLM',
  'SWR': 'Swiss',
  'ACA': 'Air Canada',
  'QFA': 'Qantas',
  'SIA': 'Singapore',
  'CPA': 'Cathay Pacific',
  'UAE': 'Emirates',
  'ETD': 'Etihad',
  'QTR': 'Qatar',
  'THY': 'Turkish',
  'ANA': 'ANA',
  'JAL': 'JAL',
};

export async function POST(request: NextRequest) {
  try {
    const { callsign, icao24 } = await request.json();
    
    if (!callsign && !icao24) {
      return NextResponse.json({ 
        departure: { airport: '---', time: null },
        arrival: { airport: '---', time: null },
        status: 'unknown'
      });
    }

    // Try to use OpenAI to look up or estimate the route
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey && callsign) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { 
                role: 'system', 
                content: `You are a flight information assistant. Given a flight callsign, try to identify the likely route.

Callsigns typically have format: AIRLINE_CODE + FLIGHT_NUMBER (e.g., UAL123 = United flight 123)

Common patterns:
- UAL, DAL, AAL are US carriers often flying domestic or transatlantic
- BAW, AFR, DLH are European carriers
- The flight number sometimes indicates the route direction (even = eastbound, odd = westbound for some airlines)

Return JSON with your best estimate:
{
  "departure": { "airport": "XXX", "city": "City Name" },
  "arrival": { "airport": "YYY", "city": "City Name" },
  "confidence": "high" | "medium" | "low",
  "airline": "Airline Name"
}

If you cannot determine the route, return:
{ "departure": { "airport": "---" }, "arrival": { "airport": "---" }, "confidence": "none" }

Note: Without real-time flight data, you're making educated guesses based on typical routes for the airline.`
              },
              { 
                role: 'user', 
                content: `What is the likely route for flight ${callsign}?` 
              }
            ],
            temperature: 0.3,
            max_tokens: 200,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '{}';
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            if (parsed.confidence !== 'none' && parsed.departure?.airport !== '---') {
              return NextResponse.json({
                departure: { 
                  airport: parsed.departure?.airport || '---', 
                  time: null,
                  city: parsed.departure?.city
                },
                arrival: { 
                  airport: parsed.arrival?.airport || '---', 
                  time: null,
                  city: parsed.arrival?.city
                },
                airline: parsed.airline,
                status: parsed.confidence === 'high' ? 'found' : 'estimated'
              });
            }
          }
        }
      } catch (e) {
        console.error('Route lookup error:', e);
      }
    }

    // Fallback: Extract airline from callsign
    const airlineCode = callsign?.substring(0, 3)?.toUpperCase();
    const airline = AIRLINE_CODES[airlineCode] || null;

    return NextResponse.json({
      departure: { airport: '---', time: null },
      arrival: { airport: '---', time: null },
      airline,
      status: 'unknown'
    });

  } catch (error) {
    console.error('Flight route API error:', error);
    return NextResponse.json({
      departure: { airport: '---', time: null },
      arrival: { airport: '---', time: null },
      status: 'unknown'
    });
  }
}

