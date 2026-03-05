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

// ==========================================
// WARMUP STATS WITH DATE RANGE COMPARISON
// ==========================================

export interface WarmupPeriodStats {
  warmup_score: number;
  warmup_emails_sent: number;
  warmup_replies_received: number;
  warmup_emails_saved_from_spam: number;
  warmup_bounces_received_count: number;
  warmup_bounces_caused_count: number;
}

export interface WarmupAccountComparison {
  id: number;
  email: string;
  name?: string;
  warmup_enabled?: boolean;
  daily_limit?: number;
  created_at?: string;
  current: WarmupPeriodStats;
  baseline: WarmupPeriodStats | null;
  changes: {
    warmup_score: number;
    warmup_replies_received: number;
    warmup_bounces_received_count: number;
  };
  health: 'declining' | 'warning' | 'stable' | 'improving' | 'new';
}

export interface WarmupStatsResponse {
  data: WarmupAccountComparison[];
  meta: {
    total: number;
    periods: {
      current: { start: string; end: string };
      baseline: { start: string; end: string } | null;
    };
    periodType: string;
    compareMode: boolean;
  };
}

export type WarmupPeriodType = '7vs7' | '7vs14' | '14vs14' | '30vs30';

/**
 * Fetch warmup stats with date range comparison
 * @param periodType - Comparison period type: '7vs14' (default), '14vs14', or '30vs30'
 * @param compare - Whether to fetch baseline period for comparison
 */
export async function fetchWarmupStats(
  periodType: WarmupPeriodType = '7vs14',
  compare: boolean = true
): Promise<WarmupStatsResponse> {
  const params = new URLSearchParams({
    period: periodType,
    compare: compare.toString(),
  });

  const response = await fetch(`/api/bison/warmup?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch warmup stats: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch warmup stats for a custom date range (no comparison)
 */
export async function fetchWarmupStatsForRange(
  startDate: string,
  endDate: string
): Promise<WarmupStatsResponse> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(`/api/bison/warmup?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch warmup stats: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get warmup health summary statistics
 */
export function getWarmupHealthSummary(accounts: WarmupAccountComparison[]): {
  total: number;
  declining: number;
  warning: number;
  stable: number;
  improving: number;
  new: number;
  avgScoreChange: number;
  avgScore: number;
  bouncesIncreasing: number;
} {
  const summary = {
    total: accounts.length,
    declining: 0,
    warning: 0,
    stable: 0,
    improving: 0,
    new: 0,
    avgScoreChange: 0,
    avgScore: 0,
    bouncesIncreasing: 0,
  };

  let totalScoreChange = 0;
  let totalScore = 0;
  let accountsWithBaseline = 0;

  for (const account of accounts) {
    // Count by health status
    switch (account.health) {
      case 'declining': summary.declining++; break;
      case 'warning': summary.warning++; break;
      case 'stable': summary.stable++; break;
      case 'improving': summary.improving++; break;
      case 'new': summary.new++; break;
    }

    // Track bounces increasing
    if (account.changes.warmup_bounces_received_count > 0) {
      summary.bouncesIncreasing++;
    }

    // Calculate averages
    totalScore += account.current.warmup_score;
    if (account.baseline) {
      totalScoreChange += account.changes.warmup_score;
      accountsWithBaseline++;
    }
  }

  summary.avgScore = accounts.length > 0 
    ? Math.round(totalScore / accounts.length) 
    : 0;
  summary.avgScoreChange = accountsWithBaseline > 0 
    ? Math.round(totalScoreChange / accountsWithBaseline * 10) / 10 
    : 0;

  return summary;
}

/**
 * Get period label for display
 */
export function getPeriodLabel(periodType: WarmupPeriodType): string {
  switch (periodType) {
    case '7vs7': return 'Last 7 days vs previous 7 days';
    case '7vs14': return 'Last 7 days vs previous 7 days';
    case '14vs14': return 'Last 14 days vs previous 14 days';
    case '30vs30': return 'Last 30 days vs previous 30 days';
  }
}
