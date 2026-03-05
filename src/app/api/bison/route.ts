import { NextRequest, NextResponse } from 'next/server';

/**
 * Bison API Proxy Route
 * 
 * Proxies requests to the Bison/LeadGenJay API to avoid CORS issues.
 * The API key should be set in the BISON_API_KEY environment variable.
 */

const BISON_BASE_URL = 'https://send.leadgenjay.com/api';

export async function GET(request: NextRequest) {
  // Check for API key from header first (client-provided), then fall back to env var
  const headerApiKey = request.headers.get('X-Bison-Api-Key');
  const apiKey = headerApiKey || process.env.BISON_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No API key provided. Set BISON_API_KEY env var or pass X-Bison-Api-Key header' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    );
  }

  // Build the Bison API URL
  const bisonUrl = new URL(`${BISON_BASE_URL}/${endpoint}`);

  // Forward query parameters (except 'endpoint')
  searchParams.forEach((value, key) => {
    if (key !== 'endpoint') {
      bisonUrl.searchParams.append(key, value);
    }
  });

  try {
    const response = await fetch(bisonUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bison API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Bison API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bison API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bison API', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.BISON_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'BISON_API_KEY environment variable not set' },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const bisonUrl = `${BISON_BASE_URL}/${endpoint}`;

    const response = await fetch(bisonUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bison API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Bison API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bison API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bison API', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const apiKey = process.env.BISON_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'BISON_API_KEY environment variable not set' },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const bisonUrl = `${BISON_BASE_URL}/${endpoint}`;

    const response = await fetch(bisonUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bison API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Bison API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bison API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bison API', details: String(error) },
      { status: 500 }
    );
  }
}
