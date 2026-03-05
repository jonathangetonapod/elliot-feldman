/**
 * EmailGuard API client for email deliverability checks.
 * 
 * Base URL: https://app.emailguard.io
 * Auth: Bearer token in Authorization header
 */

const BASE_URL = 'https://app.emailguard.io';

// ============================================================================
// Types
// ============================================================================

export interface BlacklistCheck {
  id: string;
  domain: string;
  status: string;
  blacklists: BlacklistEntry[];
  created_at: string;
  updated_at: string;
}

export interface BlacklistEntry {
  name: string;
  listed: boolean;
  details?: string;
}

export interface AdHocBlacklistRequest {
  domain: string;
  ip?: string;
}

export interface AdHocBlacklistResponse {
  data: {
    domain: string;
    ip?: string;
    blacklists: BlacklistEntry[];
    is_blacklisted: boolean;
  };
}

export interface SPFLookupResponse {
  data: {
    domain: string;
    record: string | null;
    valid: boolean;
    mechanisms: string[];
    includes: string[];
    all_mechanism: string | null;
    errors: string[];
    warnings: string[];
  };
}

export interface DKIMLookupResponse {
  data: {
    domain: string;
    selector: string;
    record: string | null;
    valid: boolean;
    public_key: string | null;
    key_type: string | null;
    key_bits: number | null;
    errors: string[];
    warnings: string[];
  };
}

export interface DMARCLookupResponse {
  data: {
    domain: string;
    record: string | null;
    valid: boolean;
    policy: string | null;
    subdomain_policy: string | null;
    percentage: number | null;
    rua: string[];
    ruf: string[];
    errors: string[];
    warnings: string[];
  };
}

export interface ContentSpamCheckRequest {
  content: string;
}

export interface ContentSpamCheckResponse {
  data: {
    message: {
      is_spam: boolean;
      spam_score: number;
      number_of_spam_words: number;
      spam_words: string[];
      comma_separated_spam_words: string;
    };
  };
}

export interface InboxPlacementTest {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results?: InboxPlacementResult[];
  created_at: string;
  updated_at: string;
}

export interface InboxPlacementResult {
  provider: string;
  inbox: boolean;
  spam: boolean;
  missing: boolean;
}

export interface CreateInboxPlacementTestRequest {
  name?: string;
  from_email: string;
  subject: string;
  body: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

// ============================================================================
// API Client Class
// ============================================================================

export class EmailGuardClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails: unknown;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }
      
      const error: ApiError = {
        message: `${response.status} ${response.statusText}: ${errorText.slice(0, 200)}`,
        status: response.status,
        details: errorDetails,
      };
      throw error;
    }

    return response.json();
  }

  // ==========================================================================
  // Blacklist Checks
  // ==========================================================================

  /**
   * Get blacklist status for monitored domains.
   */
  async getBlacklistStatus(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<BlacklistCheck>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    
    const query = searchParams.toString();
    const endpoint = `/api/v1/blacklist-checks/domains${query ? `?${query}` : ''}`;
    
    return this.request<PaginatedResponse<BlacklistCheck>>(endpoint);
  }

  /**
   * Run an ad-hoc blacklist check for a domain or IP.
   */
  async runAdHocBlacklistCheck(
    data: AdHocBlacklistRequest
  ): Promise<AdHocBlacklistResponse> {
    return this.request<AdHocBlacklistResponse>('/api/v1/blacklist-checks/ad-hoc', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==========================================================================
  // Email Authentication
  // ==========================================================================

  /**
   * Look up SPF record for a domain.
   */
  async lookupSPF(domain: string): Promise<SPFLookupResponse> {
    return this.request<SPFLookupResponse>(
      `/api/v1/email-authentication/spf-lookup?domain=${encodeURIComponent(domain)}`
    );
  }

  /**
   * Look up DKIM record for a domain and selector.
   */
  async lookupDKIM(domain: string, selector: string): Promise<DKIMLookupResponse> {
    const params = new URLSearchParams({
      domain,
      selector,
    });
    return this.request<DKIMLookupResponse>(
      `/api/v1/email-authentication/dkim-lookup?${params}`
    );
  }

  /**
   * Look up DMARC record for a domain.
   */
  async lookupDMARC(domain: string): Promise<DMARCLookupResponse> {
    return this.request<DMARCLookupResponse>(
      `/api/v1/email-authentication/dmarc-lookup?domain=${encodeURIComponent(domain)}`
    );
  }

  // ==========================================================================
  // Content Spam Check
  // ==========================================================================

  /**
   * Check content for spam indicators.
   */
  async checkContentSpam(content: string): Promise<ContentSpamCheckResponse> {
    return this.request<ContentSpamCheckResponse>('/api/v1/content-spam-check', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // ==========================================================================
  // Inbox Placement Tests
  // ==========================================================================

  /**
   * Get all inbox placement tests.
   */
  async getInboxPlacementTests(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<InboxPlacementTest>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    
    const query = searchParams.toString();
    const endpoint = `/api/v1/inbox-placement-tests${query ? `?${query}` : ''}`;
    
    return this.request<PaginatedResponse<InboxPlacementTest>>(endpoint);
  }

  /**
   * Get a specific inbox placement test by ID.
   */
  async getInboxPlacementTest(id: string): Promise<{ data: InboxPlacementTest }> {
    return this.request<{ data: InboxPlacementTest }>(
      `/api/v1/inbox-placement-tests/${encodeURIComponent(id)}`
    );
  }

  /**
   * Create a new inbox placement test.
   */
  async createInboxPlacementTest(
    data: CreateInboxPlacementTestRequest
  ): Promise<{ data: InboxPlacementTest }> {
    return this.request<{ data: InboxPlacementTest }>('/api/v1/inbox-placement-tests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

// ============================================================================
// Standalone Functions (for simpler usage)
// ============================================================================

/**
 * Create a client instance with the given API key.
 */
export function createEmailGuardClient(apiKey: string): EmailGuardClient {
  return new EmailGuardClient(apiKey);
}

/**
 * Check content for spam using EmailGuard API.
 * Matches the Python client pattern.
 */
export async function checkContentSpam(
  apiKey: string,
  content: string
): Promise<ContentSpamCheckResponse> {
  const client = new EmailGuardClient(apiKey);
  return client.checkContentSpam(content);
}

/**
 * Look up all email authentication records for a domain.
 */
export async function lookupEmailAuthentication(
  apiKey: string,
  domain: string,
  dkimSelector?: string
): Promise<{
  spf: SPFLookupResponse;
  dmarc: DMARCLookupResponse;
  dkim?: DKIMLookupResponse;
}> {
  const client = new EmailGuardClient(apiKey);
  
  const [spf, dmarc] = await Promise.all([
    client.lookupSPF(domain),
    client.lookupDMARC(domain),
  ]);

  let dkim: DKIMLookupResponse | undefined;
  if (dkimSelector) {
    dkim = await client.lookupDKIM(domain, dkimSelector);
  }

  return { spf, dmarc, dkim };
}

/**
 * Run a comprehensive domain health check.
 */
export async function checkDomainHealth(
  apiKey: string,
  domain: string,
  options?: {
    dkimSelector?: string;
    checkBlacklist?: boolean;
  }
): Promise<{
  domain: string;
  spf: SPFLookupResponse;
  dmarc: DMARCLookupResponse;
  dkim?: DKIMLookupResponse;
  blacklist?: AdHocBlacklistResponse;
}> {
  const client = new EmailGuardClient(apiKey);
  
  const promises: Promise<unknown>[] = [
    client.lookupSPF(domain),
    client.lookupDMARC(domain),
  ];

  if (options?.dkimSelector) {
    promises.push(client.lookupDKIM(domain, options.dkimSelector));
  }

  if (options?.checkBlacklist) {
    promises.push(client.runAdHocBlacklistCheck({ domain }));
  }

  const results = await Promise.all(promises);

  let idx = 0;
  const spf = results[idx++] as SPFLookupResponse;
  const dmarc = results[idx++] as DMARCLookupResponse;
  const dkim = options?.dkimSelector ? results[idx++] as DKIMLookupResponse : undefined;
  const blacklist = options?.checkBlacklist ? results[idx++] as AdHocBlacklistResponse : undefined;

  return {
    domain,
    spf,
    dmarc,
    dkim,
    blacklist,
  };
}
