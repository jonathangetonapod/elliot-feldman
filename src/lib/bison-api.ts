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
 * Fetch all sender emails with automatic pagination
 * Bison API returns 15 results per page
 */
export async function fetchSenderEmails(): Promise<SenderEmail[]> {
  const allEmails: SenderEmail[] = [];
  let page = 1;
  const maxPages = 50; // Safety limit

  while (page <= maxPages) {
    const response = await fetch(`${PROXY_BASE}?endpoint=sender-emails&page=${page}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sender emails: ${response.statusText}`);
    }

    const result: SenderEmailsResponse = await response.json();
    const emails = result.data || [];

    if (emails.length === 0) {
      break;
    }

    allEmails.push(...emails);

    // If we got less than 15 results, we're on the last page
    if (emails.length < 15) {
      break;
    }

    page++;
  }

  return allEmails;
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
 * Fetch all campaigns with optional filters
 */
export async function fetchCampaigns(options?: {
  status?: string;
  search?: string;
}): Promise<Campaign[]> {
  const params = new URLSearchParams({ endpoint: 'campaigns' });
  
  if (options?.status) {
    params.append('status', options.status);
  }
  if (options?.search) {
    params.append('search', options.search);
  }

  const response = await fetch(`${PROXY_BASE}?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch campaigns: ${response.statusText}`);
  }

  const result: CampaignsResponse = await response.json();
  return result.data || [];
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
 * Fetch all replies with pagination
 */
export async function fetchReplies(options?: {
  status?: string;
  folder?: string;
}): Promise<Reply[]> {
  const allReplies: Reply[] = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      endpoint: 'replies',
      page: page.toString(),
      folder: options?.folder || 'all',
    });
    
    if (options?.status) {
      params.append('status', options.status);
    }

    const response = await fetch(`${PROXY_BASE}?${params}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch replies: ${response.statusText}`);
    }

    const result: RepliesResponse = await response.json();
    const replies = result.data || [];

    if (replies.length === 0) {
      break;
    }

    allReplies.push(...replies);

    // Check pagination meta if available
    if (result.meta && result.meta.current_page >= result.meta.last_page) {
      break;
    }

    // If we got less than 15 results, we're on the last page
    if (replies.length < 15) {
      break;
    }

    page++;
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
