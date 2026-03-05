/**
 * Bison/LeadGenJay API client for frontend use
 * 
 * This client makes requests through the local API proxy at /api/bison
 * to avoid CORS issues with the Bison API.
 */

const PROXY_BASE = '/api/bison';

// Types
export interface SenderEmail {
  id: number;
  name: string;
  email: string;
  status: string;
  provider?: string;
  daily_limit?: number;
  warmup_enabled?: boolean;
  warmup_reputation?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SenderEmailsResponse {
  data: SenderEmail[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface WorkspaceStats {
  emails_sent: number;
  total_leads_contacted: number;
  opened: number;
  opened_percentage: number;
  unique_replies_per_contact: number;
  unique_replies_per_contact_percentage: number;
  bounced: number;
  bounced_percentage: number;
  unsubscribed: number;
  unsubscribed_percentage: number;
  interested: number;
  interested_percentage: number;
}

export interface WorkspaceStatsResponse {
  data: WorkspaceStats;
}

export interface Campaign {
  id: number;
  uuid: string;
  name: string;
  type: string;
  status: string;
  emails_sent?: number;
  opened?: number;
  opened_percentage?: number;
  unique_replies?: number;
  unique_replies_percentage?: number;
  bounced?: number;
  bounced_percentage?: number;
  interested?: number;
  interested_percentage?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignsResponse {
  data: Campaign[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface Reply {
  id: number;
  from_email_address: string;
  from_name: string;
  subject: string;
  text_body: string;
  html_body?: string;
  date_received: string;
  type: string;
  lead_id: number;
  read: boolean;
  interested?: boolean;
  status?: string;
}

export interface RepliesResponse {
  data: Reply[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

// Warmup stats derived from sender email data
export interface WarmupStatus {
  email: string;
  enabled: boolean;
  reputation: number;
  dailyLimit: number;
  status: string;
}

// Reply stats per sender
export interface SenderReplyStats {
  senderEmail: string;
  totalReplies: number;
  interestedReplies: number;
  replyRate: number;
}

/**
 * Fetch all sender emails
 * Now uses the server-side parallel pagination (API already handles this)
 */
export async function fetchSenderEmails(): Promise<SenderEmail[]> {
  const response = await fetch(`${PROXY_BASE}?endpoint=sender-emails`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sender emails: ${response.statusText}`);
  }

  const result: SenderEmailsResponse = await response.json();
  return result.data || [];
}

/**
 * Fetch a specific sender email by ID
 */
export async function fetchSenderEmail(id: number): Promise<SenderEmail> {
  const response = await fetch(`${PROXY_BASE}?endpoint=sender-emails/${id}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sender email ${id}: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get warmup status for all accounts
 * Extracts warmup-related fields from sender email data
 */
export async function getWarmupStatus(): Promise<WarmupStatus[]> {
  const senderEmails = await fetchSenderEmails();
  
  return senderEmails.map(email => ({
    email: email.email,
    enabled: email.warmup_enabled ?? false,
    reputation: email.warmup_reputation ?? 0,
    dailyLimit: email.daily_limit ?? 0,
    status: email.status,
  }));
}

/**
 * Fetch workspace stats for a date range
 */
export async function fetchWorkspaceStats(
  startDate: string,
  endDate: string
): Promise<WorkspaceStats> {
  const params = new URLSearchParams({
    endpoint: 'workspaces/v1.1/stats',
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`${PROXY_BASE}?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch workspace stats: ${response.statusText}`);
  }

  const result: WorkspaceStatsResponse = await response.json();
  return result.data;
}

/**
 * Fetch all campaigns with optional filters and PARALLEL pagination
 */
export async function fetchCampaigns(options?: {
  status?: string;
  search?: string;
}): Promise<Campaign[]> {
  const buildParams = (page: number) => {
    const params = new URLSearchParams({ 
      endpoint: 'campaigns',
      page: page.toString(),
    });
    if (options?.status) {
      params.append('status', options.status);
    }
    if (options?.search) {
      params.append('search', options.search);
    }
    return params;
  };

  // First, get page 1 to know total pages
  const firstResponse = await fetch(`${PROXY_BASE}?${buildParams(1)}`);
  if (!firstResponse.ok) {
    throw new Error(`Failed to fetch campaigns: ${firstResponse.statusText}`);
  }

  const firstResult: CampaignsResponse = await firstResponse.json();
  const allCampaigns: Campaign[] = [...(firstResult.data || [])];
  
  const totalPages = firstResult.meta?.last_page || 1;
  if (totalPages <= 1) {
    return allCampaigns;
  }
  
  // Fetch remaining pages in parallel
  const remainingPages = Array.from({ length: Math.min(totalPages - 1, 49) }, (_, i) => i + 2);
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
    const batch = remainingPages.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async page => {
        try {
          const response = await fetch(`${PROXY_BASE}?${buildParams(page)}`);
          if (!response.ok) return { data: [] };
          return response.json() as Promise<CampaignsResponse>;
        } catch {
          return { data: [] };
        }
      })
    );
    
    for (const result of batchResults) {
      allCampaigns.push(...(result.data || []));
    }
  }
  
  return allCampaigns;
}

/**
 * Fetch campaign stats (aggregated from campaigns endpoint)
 */
export async function fetchCampaignStats(): Promise<{
  totalCampaigns: number;
  activeCampaigns: number;
  totalEmailsSent: number;
  totalOpens: number;
  totalReplies: number;
  totalBounces: number;
  averageOpenRate: number;
  averageReplyRate: number;
}> {
  const campaigns = await fetchCampaigns();
  
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalEmailsSent = campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
  const totalReplies = campaigns.reduce((sum, c) => sum + (c.unique_replies || 0), 0);
  const totalBounces = campaigns.reduce((sum, c) => sum + (c.bounced || 0), 0);

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns,
    totalEmailsSent,
    totalOpens,
    totalReplies,
    totalBounces,
    averageOpenRate: totalEmailsSent > 0 ? (totalOpens / totalEmailsSent) * 100 : 0,
    averageReplyRate: totalEmailsSent > 0 ? (totalReplies / totalEmailsSent) * 100 : 0,
  };
}

/**
 * Fetch all replies with PARALLEL pagination
 */
export async function fetchReplies(options?: {
  status?: string;
  folder?: string;
}): Promise<Reply[]> {
  const buildParams = (page: number) => {
    const params = new URLSearchParams({
      endpoint: 'replies',
      page: page.toString(),
      folder: options?.folder || 'all',
    });
    if (options?.status) {
      params.append('status', options.status);
    }
    return params;
  };

  // First, get page 1 to know total pages
  const firstResponse = await fetch(`${PROXY_BASE}?${buildParams(1)}`);
  if (!firstResponse.ok) {
    throw new Error(`Failed to fetch replies: ${firstResponse.statusText}`);
  }
  
  const firstResult: RepliesResponse = await firstResponse.json();
  const allReplies: Reply[] = [...(firstResult.data || [])];
  
  const totalPages = firstResult.meta?.last_page || 1;
  if (totalPages <= 1) {
    return allReplies;
  }
  
  // Fetch remaining pages in parallel
  const remainingPages = Array.from({ length: Math.min(totalPages - 1, 49) }, (_, i) => i + 2);
  const BATCH_SIZE = 5; // Fetch 5 pages at once
  
  for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
    const batch = remainingPages.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async page => {
        try {
          const response = await fetch(`${PROXY_BASE}?${buildParams(page)}`);
          if (!response.ok) return { data: [] };
          return response.json() as Promise<RepliesResponse>;
        } catch {
          return { data: [] };
        }
      })
    );
    
    for (const result of batchResults) {
      allReplies.push(...(result.data || []));
    }
  }

  return allReplies;
}

/**
 * Get reply statistics per sender email
 * Groups replies by the sender email that sent the campaign
 */
export async function getReplyStatsPerSender(): Promise<SenderReplyStats[]> {
  const [replies, senderEmails] = await Promise.all([
    fetchReplies(),
    fetchSenderEmails(),
  ]);

  // Create a map of sender email stats
  const statsMap = new Map<string, { total: number; interested: number }>();
  
  // Initialize with all sender emails
  senderEmails.forEach(sender => {
    statsMap.set(sender.email, { total: 0, interested: 0 });
  });

  // Count replies (note: replies are FROM leads, but we'd need campaign data
  // to properly attribute them to sender emails)
  // For now, we return sender emails with their campaign stats

  return senderEmails.map(sender => ({
    senderEmail: sender.email,
    totalReplies: 0, // Would need campaign attribution
    interestedReplies: 0,
    replyRate: 0,
  }));
}

/**
 * Helper to format date for API requests
 */
export function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get stats for the last N days
 */
export async function getRecentStats(days: number = 30): Promise<WorkspaceStats> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return fetchWorkspaceStats(
    formatDateForApi(startDate),
    formatDateForApi(endDate)
  );
}
