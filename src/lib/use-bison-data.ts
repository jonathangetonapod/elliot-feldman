"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardStats, SenderEmail, DomainHealth, EmailStatus } from './mock-data';

// Types for Bison API responses
interface BisonSenderEmail {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  domain?: string;
  status?: string;
  warmupStatus?: string;
  warmupDay?: number;
  dailyLimit?: number;
  currentVolume?: number;
  replyRate?: number;
  avgReplyRate?: number;
  sentLast7Days?: number;
  repliesLast7Days?: number;
  lastSyncedAt?: string;
  // Additional fields from actual API
  totalSent?: number;
  totalReplies?: number;
  bounceRate?: number;
  // Bison API field names
  emails_sent_count?: number;
  emails_sent_today?: number;
  daily_limit?: number;
  warmup_enabled?: boolean;
  created_at?: string;
  // Reply tracking fields from Bison API
  unique_replied_count?: number;
  total_replied_count?: number;
}

interface BisonCampaign {
  id: number;
  uuid: string;
  name: string;
  status: string;
  emails_sent?: number;
  opened?: number;
  unique_replies?: number;
  bounced?: number;
}

interface BisonWorkspaceStats {
  emails_sent?: number;
  total_leads_contacted?: number;
  opened?: number;
  opened_percentage?: number;
  unique_replies_per_contact?: number;
  unique_replies_per_contact_percentage?: number;
  bounced?: number;
  bounced_percentage?: number;
}

export interface BisonDataState {
  stats: DashboardStats | null;
  emails: SenderEmail[];
  domains: DomainHealth[];
  campaigns: BisonCampaign[];
  workspaceStats: BisonWorkspaceStats | null;
  loading: boolean;
  emailsLoading: boolean;
  campaignsLoading: boolean;
  statsLoading: boolean;
  error: string | null;
  connected: boolean;
  lastFetched: Date | null;
}

// Cache for stale-while-revalidate pattern
const CACHE_KEY = 'elliot-feldman-bison-cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheData {
  emails: SenderEmail[];
  domains: DomainHealth[];
  stats: DashboardStats;
  campaigns: BisonCampaign[];
  workspaceStats: BisonWorkspaceStats | null;
  timestamp: number;
}

function getCache(): CacheData | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as CacheData;
    // Return cache even if stale - we'll refresh in background
    return data;
  } catch {
    return null;
  }
}

function setCache(data: Omit<CacheData, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const cacheData: CacheData = { ...data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    // Ignore storage errors
  }
}

function isCacheStale(cache: CacheData): boolean {
  return Date.now() - cache.timestamp > CACHE_TTL;
}

// Determine email health status based on reply rate
// Uses same thresholds as emails/page.tsx for consistency
function calculateHealthStatus(replyRate: number): EmailStatus {
  if (replyRate >= 2) return 'healthy';
  if (replyRate >= 1) return 'warning';
  return 'burned';
}

// Extract domain from email address
function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1] : '';
}

// Transform Bison sender emails to our format
function transformSenderEmail(bisonEmail: BisonSenderEmail): SenderEmail {
  const email = bisonEmail.email || '';
  const domain = bisonEmail.domain || extractDomain(email);
  
  // Get total sent from Bison API
  const totalSent = bisonEmail.emails_sent_count || bisonEmail.totalSent || 0;
  
  // Get replies from Bison API - prefer unique_replied_count
  const totalReplies = bisonEmail.unique_replied_count ?? bisonEmail.total_replied_count ?? bisonEmail.totalReplies ?? 0;
  
  // Calculate reply rate from actual data: (replies / sent) * 100
  let replyRate = 0;
  if (totalSent > 0) {
    replyRate = (totalReplies / totalSent) * 100;
  }
  
  // Always calculate health status from reply rate - don't use API's connection status field
  const status = calculateHealthStatus(replyRate);
  
  // Determine warmup status from warmup_enabled boolean (not warmupStatus string)
  // warmup_enabled: true = actively warming = 'warming'
  // warmup_enabled: false = warmup off = 'ready'
  const warmupStatus: 'warming' | 'ready' | 'paused' = bisonEmail.warmup_enabled === true ? 'warming' : 'ready';
  
  const warmupReadyDate = new Date();
  warmupReadyDate.setDate(warmupReadyDate.getDate() + (30 - (bisonEmail.warmupDay || 30)));
  
  return {
    id: bisonEmail.id,
    email,
    name: bisonEmail.name || `${bisonEmail.firstName || ''} ${bisonEmail.lastName || ''}`.trim() || email.split('@')[0],
    domain,
    status,
    warmupStatus,
    warmupDay: bisonEmail.warmupDay || 30,
    warmupReadyDate: warmupReadyDate.toISOString().split('T')[0],
    dailyLimit: bisonEmail.dailyLimit || bisonEmail.daily_limit || 50,
    currentVolume: bisonEmail.currentVolume || bisonEmail.emails_sent_today || 0,
    replyRate: Math.round(replyRate * 100) / 100,
    avgReplyRate: bisonEmail.avgReplyRate || 2.2,
    sentLast7Days: totalSent,
    repliesLast7Days: totalReplies,
    lastSyncedAt: bisonEmail.lastSyncedAt || new Date().toISOString(),
  };
}

// Calculate domain health from emails - memoizable pure function
function calculateDomainHealth(emails: SenderEmail[]): DomainHealth[] {
  const domainMap = new Map<string, SenderEmail[]>();
  
  emails.forEach(email => {
    const existing = domainMap.get(email.domain) || [];
    existing.push(email);
    domainMap.set(email.domain, existing);
  });
  
  return Array.from(domainMap.entries()).map(([domain, domainEmails]) => {
    const healthyCount = domainEmails.filter(e => e.status === 'healthy').length;
    const warningCount = domainEmails.filter(e => e.status === 'warning').length;
    const burnedCount = domainEmails.filter(e => e.status === 'burned').length;
    
    const burnedRatio = burnedCount / domainEmails.length;
    const spamScore = Math.round((1 + burnedRatio * 8) * 10) / 10;
    
    const blacklistStatus = burnedRatio > 0.15 ? 'listed' : 'clean';
    const blacklistCount = blacklistStatus === 'listed' ? Math.ceil(burnedRatio * 5) : 0;
    
    return {
      domain,
      totalEmails: domainEmails.length,
      healthyEmails: healthyCount,
      warningEmails: warningCount,
      burnedEmails: burnedCount,
      spamScore,
      blacklistStatus: blacklistStatus as 'clean' | 'listed',
      blacklistCount,
      spfValid: true,
      dkimValid: true,
      dmarcValid: true,
      inboxPlacementRate: Math.round((85 - burnedRatio * 30) * 10) / 10,
      lastCheckedAt: new Date().toISOString(),
    };
  });
}

// Calculate dashboard stats from emails - memoizable pure function
function calculateDashboardStats(emails: SenderEmail[], domains: DomainHealth[]): DashboardStats {
  const healthyEmails = emails.filter(e => e.status === 'healthy').length;
  const warningEmails = emails.filter(e => e.status === 'warning').length;
  const burnedEmails = emails.filter(e => e.status === 'burned').length;
  const warmingEmails = emails.filter(e => e.warmupStatus === 'warming').length;
  const readyEmails = emails.filter(e => e.warmupStatus === 'ready').length;
  const flaggedDomains = domains.filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5).length;
  
  const totalReplies = emails.reduce((sum, e) => sum + e.repliesLast7Days, 0);
  const totalSent = emails.reduce((sum, e) => sum + e.sentLast7Days, 0);
  const avgReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100 * 100) / 100 : 0;
  
  return {
    totalEmails: emails.length,
    healthyEmails,
    warningEmails,
    burnedEmails,
    totalDomains: domains.length,
    flaggedDomains,
    avgReplyRate,
    warmingEmails,
    readyEmails,
    totalSentLast7Days: totalSent,
    totalRepliesLast7Days: totalReplies,
  };
}

// Check if API key is configured
export function getApiKeyFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const config = localStorage.getItem('elliot-feldman-config');
    if (!config) return null;
    
    const parsed = JSON.parse(config);
    return parsed.apiKey || parsed.bisonApiKey || null;
  } catch {
    return null;
  }
}

// Parallel fetch helper with error handling
async function fetchWithFallback<T>(
  url: string,
  fallback: T
): Promise<{ data: T; error: string | null }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { data: fallback, error: errorData.error || `API error: ${response.status}` };
    }
    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: fallback, error: err instanceof Error ? err.message : 'Fetch failed' };
  }
}

export function useBisonData(): BisonDataState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<BisonDataState>(() => {
    // Initialize with cached data if available (stale-while-revalidate)
    const cache = getCache();
    if (cache) {
      return {
        stats: cache.stats,
        emails: cache.emails,
        domains: cache.domains,
        campaigns: cache.campaigns || [],
        workspaceStats: cache.workspaceStats || null,
        loading: isCacheStale(cache), // Only show loading if cache is stale
        emailsLoading: isCacheStale(cache),
        campaignsLoading: isCacheStale(cache),
        statsLoading: isCacheStale(cache),
        error: null,
        connected: true,
        lastFetched: new Date(cache.timestamp),
      };
    }
    return {
      stats: null,
      emails: [],
      domains: [],
      campaigns: [],
      workspaceStats: null,
      loading: true,
      emailsLoading: true,
      campaignsLoading: true,
      statsLoading: true,
      error: null,
      connected: false,
      lastFetched: null,
    };
  });
  
  // Track if fetch is in progress to prevent duplicate calls
  const fetchInProgressRef = useRef(false);

  const fetchData = useCallback(async () => {
    // Prevent duplicate fetches
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;

    // Only show loading spinners if we don't have cached data
    const hasCache = state.emails.length > 0;
    if (!hasCache) {
      setState(prev => ({ 
        ...prev, 
        loading: true, 
        emailsLoading: true,
        campaignsLoading: true,
        statsLoading: true,
        error: null 
      }));
    }

    try {
      // Get date range for workspace stats (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      // PARALLEL FETCH: Fetch all endpoints simultaneously
      const [emailsResult, campaignsResult, workspaceStatsResult] = await Promise.all([
        // Fetch sender emails (uses parallel pagination internally)
        fetchWithFallback<{ data?: BisonSenderEmail[] }>(
          '/api/bison?endpoint=sender-emails',
          { data: [] }
        ),
        // Fetch campaigns
        fetchWithFallback<{ data?: BisonCampaign[] }>(
          '/api/bison?endpoint=campaigns',
          { data: [] }
        ),
        // Fetch workspace stats
        fetchWithFallback<{ data?: BisonWorkspaceStats }>(
          `/api/bison?endpoint=workspaces/v1.1/stats&start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`,
          { data: undefined }
        ),
      ]);

      // Process emails first (critical path)
      const rawEmails: BisonSenderEmail[] = Array.isArray(emailsResult.data)
        ? emailsResult.data
        : emailsResult.data?.data || [];
      
      const emails = rawEmails.map(transformSenderEmail);
      const domains = calculateDomainHealth(emails);
      const stats = calculateDashboardStats(emails, domains);
      
      // Update state with emails immediately
      setState(prev => ({
        ...prev,
        stats,
        emails,
        domains,
        emailsLoading: false,
        loading: false,
        error: emailsResult.error,
        connected: !emailsResult.error,
        lastFetched: new Date(),
      }));

      // Process campaigns
      const campaigns: BisonCampaign[] = Array.isArray(campaignsResult.data)
        ? campaignsResult.data
        : campaignsResult.data?.data || [];

      setState(prev => ({
        ...prev,
        campaigns,
        campaignsLoading: false,
      }));

      // Process workspace stats
      const workspaceStats = workspaceStatsResult.data?.data || null;

      setState(prev => ({
        ...prev,
        workspaceStats,
        statsLoading: false,
      }));

      // Update cache
      setCache({
        emails,
        domains,
        stats,
        campaigns,
        workspaceStats,
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setState(prev => ({
        ...prev,
        loading: false,
        emailsLoading: false,
        campaignsLoading: false,
        statsLoading: false,
        error: errorMessage,
        connected: false,
      }));
    } finally {
      fetchInProgressRef.current = false;
    }
  }, [state.emails.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(() => ({ ...state, refetch: fetchData }), [state, fetchData]);
}

// Hook to check if we should use real data
export function useHasApiKey(): boolean {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    // We always try to use the API since the key is server-side
    // The API will return an error if not configured
    setHasKey(true);
  }, []);

  return hasKey;
}

// Separate hooks for individual data sections (for Suspense boundaries)
export function useBisonEmails() {
  const { emails, emailsLoading, error, refetch } = useBisonData();
  return { emails, loading: emailsLoading, error, refetch };
}

export function useBisonCampaigns() {
  const { campaigns, campaignsLoading, error, refetch } = useBisonData();
  return { campaigns, loading: campaignsLoading, error, refetch };
}

export function useBisonStats() {
  const { stats, statsLoading, error, refetch } = useBisonData();
  return { stats, loading: statsLoading, error, refetch };
}
