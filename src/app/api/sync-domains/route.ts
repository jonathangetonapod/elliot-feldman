import { NextRequest, NextResponse } from 'next/server';

/**
 * Sync Domains API Route
 * 
 * Fetches all sender emails from Bison, extracts unique domains,
 * compares with existing EmailGuard domains, and adds new ones.
 */

const BISON_BASE_URL = 'https://send.leadgenjay.com/api';
const EMAILGUARD_BASE_URL = 'https://app.emailguard.io/api/v1';
const PARALLEL_BATCH_SIZE = 10;

interface BisonEmail {
  email: string;
  [key: string]: unknown;
}

interface EmailGuardDomain {
  id: number;
  name: string;
  [key: string]: unknown;
}

interface SyncResult {
  total_bison_domains: number;
  existing_emailguard_domains: number;
  newly_added: string[];
  errors: { domain: string; error: string }[];
}

// Fetch a single page of sender emails from Bison
async function fetchBisonPage(apiKey: string, page: number): Promise<{ data: BisonEmail[], meta: { last_page?: number } }> {
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

// Fetch all sender emails from Bison with parallel processing
async function fetchAllBisonEmails(apiKey: string): Promise<BisonEmail[]> {
  const firstPage = await fetchBisonPage(apiKey, 1);
  const totalPages = firstPage.meta?.last_page || 1;
  const allEmails: BisonEmail[] = [...(firstPage.data || [])];
  
  if (totalPages <= 1) {
    return allEmails;
  }
  
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  
  for (let i = 0; i < remainingPages.length; i += PARALLEL_BATCH_SIZE) {
    const batch = remainingPages.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(page => fetchBisonPage(apiKey, page).catch(err => {
        console.error(`Failed to fetch page ${page}:`, err);
        return { data: [], meta: {} };
      }))
    );
    
    for (const result of batchResults) {
      allEmails.push(...(result.data || []));
    }
  }
  
  return allEmails;
}

// Extract unique domains from email addresses
function extractUniqueDomains(emails: BisonEmail[]): string[] {
  const domains = new Set<string>();
  
  for (const emailObj of emails) {
    const email = emailObj.email;
    if (email && typeof email === 'string' && email.includes('@')) {
      const domain = email.split('@')[1]?.toLowerCase().trim();
      if (domain) {
        domains.add(domain);
      }
    }
  }
  
  return Array.from(domains);
}

// Fetch all domains from EmailGuard
async function fetchEmailGuardDomains(apiKey: string): Promise<EmailGuardDomain[]> {
  const allDomains: EmailGuardDomain[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(`${EMAILGUARD_BASE_URL}/domains?page=${page}&per_page=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailGuard API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const domains = data.data || [];
    allDomains.push(...domains);
    
    // Check if there are more pages
    const lastPage = data.meta?.last_page || data.last_page || 1;
    hasMore = page < lastPage;
    page++;
  }
  
  return allDomains;
}

// Add a domain to EmailGuard
async function addDomainToEmailGuard(apiKey: string, domain: string): Promise<void> {
  const response = await fetch(`${EMAILGUARD_BASE_URL}/domains`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ name: domain }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add domain: ${response.status} - ${errorText}`);
  }
}

export async function POST(request: NextRequest) {
  // Get API keys from headers first, then fall back to env vars
  const bisonApiKey = request.headers.get('X-Bison-Api-Key') || process.env.BISON_API_KEY;
  const emailGuardApiKey = request.headers.get('X-EmailGuard-Api-Key') || process.env.EMAILGUARD_API_KEY;
  
  if (!bisonApiKey) {
    return NextResponse.json(
      { error: 'No Bison API key provided. Set BISON_API_KEY env var or pass X-Bison-Api-Key header' },
      { status: 401 }
    );
  }
  
  if (!emailGuardApiKey) {
    return NextResponse.json(
      { error: 'No EmailGuard API key provided. Set EMAILGUARD_API_KEY env var or pass X-EmailGuard-Api-Key header' },
      { status: 401 }
    );
  }
  
  const result: SyncResult = {
    total_bison_domains: 0,
    existing_emailguard_domains: 0,
    newly_added: [],
    errors: [],
  };
  
  try {
    // Step 1: Fetch all sender emails from Bison
    console.log('Fetching sender emails from Bison...');
    const bisonEmails = await fetchAllBisonEmails(bisonApiKey);
    console.log(`Fetched ${bisonEmails.length} emails from Bison`);
    
    // Step 2: Extract unique domains
    const bisonDomains = extractUniqueDomains(bisonEmails);
    result.total_bison_domains = bisonDomains.length;
    console.log(`Extracted ${bisonDomains.length} unique domains from Bison`);
    
    // Step 3: Fetch existing domains from EmailGuard
    console.log('Fetching existing domains from EmailGuard...');
    const emailGuardDomains = await fetchEmailGuardDomains(emailGuardApiKey);
    const existingDomainNames = new Set(emailGuardDomains.map(d => d.name.toLowerCase()));
    result.existing_emailguard_domains = emailGuardDomains.length;
    console.log(`Found ${emailGuardDomains.length} existing domains in EmailGuard`);
    
    // Step 4: Find new domains
    const newDomains = bisonDomains.filter(d => !existingDomainNames.has(d.toLowerCase()));
    console.log(`Found ${newDomains.length} new domains to add`);
    
    // Step 5: Add new domains to EmailGuard
    for (const domain of newDomains) {
      try {
        await addDomainToEmailGuard(emailGuardApiKey, domain);
        result.newly_added.push(domain);
        console.log(`Added domain: ${domain}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.errors.push({ domain, error: errorMessage });
        console.error(`Failed to add domain ${domain}:`, errorMessage);
      }
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Domain sync error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to sync domains', 
        details: error instanceof Error ? error.message : String(error),
        partial_result: result,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    service: 'sync-domains',
    description: 'Sync domains from Bison to EmailGuard',
    method: 'POST',
    headers: {
      'X-Bison-Api-Key': 'optional (falls back to BISON_API_KEY env var)',
      'X-EmailGuard-Api-Key': 'optional (falls back to EMAILGUARD_API_KEY env var)',
    },
    response: {
      total_bison_domains: 'number',
      existing_emailguard_domains: 'number',
      newly_added: 'string[]',
      errors: '{ domain: string, error: string }[]',
    },
  });
}
