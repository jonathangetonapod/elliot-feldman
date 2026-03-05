"use client";

import { useState, useEffect, useCallback } from 'react';
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

interface BisonWorkspaceStats {
  totalSenderEmails?: number;
  totalDomains?: number;
  avgReplyRate?: number;
  totalSent?: number;
  totalReplies?: number;
  // May have other fields
}

export interface BisonDataState {
  stats: DashboardStats | null;
  emails: SenderEmail[];
  domains: DomainHealth[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastFetched: Date | null;
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

// Calculate domain health from emails
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

// Calculate dashboard stats from emails
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

export function useBisonData(): BisonDataState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<BisonDataState>({
    stats: null,
    emails: [],
    domains: [],
    loading: true,
    error: null,
    connected: false,
    lastFetched: null,
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch sender emails from Bison API
      const emailsResponse = await fetch('/api/bison?endpoint=sender-emails');
      
      if (!emailsResponse.ok) {
        const errorData = await emailsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${emailsResponse.status}`);
      }

      const emailsData = await emailsResponse.json();
      
      // Handle different response formats
      const rawEmails: BisonSenderEmail[] = Array.isArray(emailsData) 
        ? emailsData 
        : emailsData.data || emailsData.senderEmails || emailsData.emails || [];
      
      // Transform to our format
      const emails = rawEmails.map(transformSenderEmail);
      
      // Calculate domain health from emails
      const domains = calculateDomainHealth(emails);
      
      // Calculate dashboard stats
      const stats = calculateDashboardStats(emails, domains);

      setState({
        stats,
        emails,
        domains,
        loading: false,
        error: null,
        connected: true,
        lastFetched: new Date(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        connected: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
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
