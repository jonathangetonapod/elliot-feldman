import { NextRequest, NextResponse } from 'next/server';

/**
 * Bison API Proxy Route
 * 
 * Proxies requests to the Bison/LeadGenJay API to avoid CORS issues.
 * The API key should be set in the BISON_API_KEY environment variable.
 * 
 * For sender-emails endpoint, automatically fetches ALL pages in PARALLEL.
 * Bison allows 3000 requests/min, so we can be aggressive.
 */

const BISON_BASE_URL = 'https://send.leadgenjay.com/api';
const PARALLEL_BATCH_SIZE = 10; // Fetch 10 pages at once

// Fetch a single page of sender emails
async function fetchPage(apiKey: string, page: number): Promise<{ data: any[], meta: any }> {
  const response = await fetch(`${BISON_BASE_URL}/sender-emails?page=${page}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Bison API error: ${response.status}`);
  }
  
  return response.json();
}

// Fetch all pages of sender emails with PARALLEL processing
async function fetchAllSenderEmails(apiKey: string): Promise<{ data: any[], meta: any }> {
  // First, get page 1 to know total pages
  const firstPage = await fetchPage(apiKey, 1);
  const totalPages = firstPage.meta?.last_page || 1;
  const allEmails: any[] = [...(firstPage.data || [])];
  
  if (totalPages <= 1) {
    return {
      data: allEmails,
      meta: {
        total: allEmails.length,
        current_page: 1,
        last_page: 1,
        per_page: allEmails.length,
      }
    };
  }
  
  // Fetch remaining pages in parallel batches
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  
  for (let i = 0; i < remainingPages.length; i += PARALLEL_BATCH_SIZE) {
    const batch = remainingPages.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(page => fetchPage(apiKey, page).catch(err => {
        console.error(`Failed to fetch page ${page}:`, err);
        return { data: [], meta: {} };
      }))
    );
    
    for (const result of batchResults) {
      allEmails.push(...(result.data || []));
    }
  }
  
  return {
    data: allEmails,
    meta: {
      total: allEmails.length,
      current_page: 1,
      last_page: 1,
      per_page: allEmails.length,
    }
  };
}

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

  try {
    // Special handling for sender-emails: fetch ALL pages in parallel
    if (endpoint === 'sender-emails') {
      const startTime = Date.now();
      const data = await fetchAllSenderEmails(apiKey);
      const duration = Date.now() - startTime;
      console.log(`Fetched ${data.data.length} sender emails in ${duration}ms`);
      return NextResponse.json(data);
    }

    // Build the Bison API URL for other endpoints
    const bisonUrl = new URL(`${BISON_BASE_URL}/${endpoint}`);

    // Forward query parameters (except 'endpoint')
    searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        bisonUrl.searchParams.append(key, value);
      }
    });

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
