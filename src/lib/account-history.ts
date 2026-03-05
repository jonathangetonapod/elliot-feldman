"use client";

// Types for account history tracking
export interface AccountSnapshot {
  date: string; // YYYY-MM-DD
  accountId: number;
  email: string;
  replyRate: number;
  emailsSent: number;
  replies: number;
  status: 'healthy' | 'warning' | 'burned';
  dailyLimit: number;
}

export interface AccountHistoryData {
  snapshots: AccountSnapshot[];
  lastUpdated: string;
}

export interface StatusTransition {
  accountId: number;
  email: string;
  fromStatus: 'healthy' | 'warning' | 'burned';
  toStatus: 'healthy' | 'warning' | 'burned';
  date: string;
  daysInPreviousStatus: number;
}

export interface AccountTrend {
  accountId: number;
  email: string;
  trend: 'improving' | 'stable' | 'declining';
  replyRateChange: number; // % change over last 7 days
  replyRates: { date: string; rate: number }[];
}

export interface LifespanStats {
  avgDaysHealthyToWarning: number | null;
  avgDaysWarningToBurned: number | null;
  avgTotalLifespan: number | null;
  accountsTracked: number;
  transitionsTracked: number;
}

const STORAGE_KEY = 'elliot-feldman-account-history';
const MAX_DAYS_HISTORY = 30;

// Get today's date in YYYY-MM-DD format
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Load history from localStorage
export function loadAccountHistory(): AccountHistoryData {
  if (typeof window === 'undefined') {
    return { snapshots: [], lastUpdated: '' };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { snapshots: [], lastUpdated: '' };
    }
    
    const data = JSON.parse(stored) as AccountHistoryData;
    
    // Clean up old snapshots (older than MAX_DAYS_HISTORY)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_DAYS_HISTORY);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    data.snapshots = data.snapshots.filter(s => s.date >= cutoffStr);
    
    return data;
  } catch {
    return { snapshots: [], lastUpdated: '' };
  }
}

// Save history to localStorage
export function saveAccountHistory(data: AccountHistoryData): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save account history:', error);
  }
}

// Take a snapshot of current account data
export function takeSnapshot(
  accounts: Array<{
    id: number;
    email: string;
    replyRate: number;
    sentLast7Days?: number;
    totalSent?: number;
    repliesLast7Days?: number;
    totalReplies?: number;
    status: 'healthy' | 'warning' | 'burned';
    dailyLimit: number;
  }>
): void {
  const today = getTodayDate();
  const history = loadAccountHistory();
  
  // Check if we already have a snapshot for today
  const hasToday = history.snapshots.some(s => s.date === today);
  if (hasToday) {
    // Already recorded today, skip
    return;
  }
  
  // Create snapshots for each account
  const newSnapshots: AccountSnapshot[] = accounts.map(account => ({
    date: today,
    accountId: account.id,
    email: account.email,
    replyRate: account.replyRate,
    emailsSent: account.totalSent ?? account.sentLast7Days ?? 0,
    replies: account.totalReplies ?? account.repliesLast7Days ?? 0,
    status: account.status,
    dailyLimit: account.dailyLimit,
  }));
  
  // Add new snapshots and clean up old ones
  history.snapshots = [...history.snapshots, ...newSnapshots];
  history.lastUpdated = new Date().toISOString();
  
  // Remove snapshots older than MAX_DAYS_HISTORY
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_DAYS_HISTORY);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  history.snapshots = history.snapshots.filter(s => s.date >= cutoffStr);
  
  saveAccountHistory(history);
}

// Get all unique dates in history
export function getHistoryDates(): string[] {
  const history = loadAccountHistory();
  const dates = [...new Set(history.snapshots.map(s => s.date))];
  return dates.sort();
}

// Get snapshots for a specific account
export function getAccountSnapshots(accountId: number): AccountSnapshot[] {
  const history = loadAccountHistory();
  return history.snapshots
    .filter(s => s.accountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Detect status transitions (degradation or improvement)
export function detectStatusTransitions(): StatusTransition[] {
  const history = loadAccountHistory();
  const dates = getHistoryDates();
  
  if (dates.length < 2) return [];
  
  const transitions: StatusTransition[] = [];
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  
  for (const accountId of accountIds) {
    const accountSnapshots = history.snapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    if (accountSnapshots.length < 2) continue;
    
    for (let i = 1; i < accountSnapshots.length; i++) {
      const prev = accountSnapshots[i - 1];
      const curr = accountSnapshots[i];
      
      if (prev.status !== curr.status) {
        // Count days in previous status
        let daysInPrevious = 1;
        for (let j = i - 2; j >= 0; j--) {
          if (accountSnapshots[j].status === prev.status) {
            daysInPrevious++;
          } else {
            break;
          }
        }
        
        transitions.push({
          accountId: curr.accountId,
          email: curr.email,
          fromStatus: prev.status,
          toStatus: curr.status,
          date: curr.date,
          daysInPreviousStatus: daysInPrevious,
        });
      }
    }
  }
  
  return transitions.sort((a, b) => b.date.localeCompare(a.date));
}

// Get recently degraded accounts (last 7 days)
export function getRecentlyDegraded(days: number = 7): StatusTransition[] {
  const transitions = detectStatusTransitions();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  return transitions.filter(t => 
    t.date >= cutoffStr && 
    (
      (t.fromStatus === 'healthy' && t.toStatus === 'warning') ||
      (t.fromStatus === 'warning' && t.toStatus === 'burned') ||
      (t.fromStatus === 'healthy' && t.toStatus === 'burned')
    )
  );
}

// Calculate lifespan statistics
export function calculateLifespanStats(): LifespanStats {
  const transitions = detectStatusTransitions();
  
  const healthyToWarning = transitions.filter(
    t => t.fromStatus === 'healthy' && t.toStatus === 'warning'
  );
  
  const warningToBurned = transitions.filter(
    t => t.fromStatus === 'warning' && t.toStatus === 'burned'
  );
  
  // For total lifespan, find accounts that went from healthy to burned
  // Either directly or through warning
  const accountIds = [...new Set(transitions.map(t => t.accountId))];
  const totalLifespans: number[] = [];
  
  for (const accountId of accountIds) {
    const accountTransitions = transitions.filter(t => t.accountId === accountId);
    
    // Find first transition from healthy
    const firstHealthyExit = accountTransitions.find(
      t => t.fromStatus === 'healthy'
    );
    
    // Find transition to burned
    const burnedEntry = accountTransitions.find(
      t => t.toStatus === 'burned'
    );
    
    if (firstHealthyExit && burnedEntry) {
      // Calculate days from healthy to burned
      const startDate = new Date(firstHealthyExit.date);
      startDate.setDate(startDate.getDate() - firstHealthyExit.daysInPreviousStatus);
      const endDate = new Date(burnedEntry.date);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        totalLifespans.push(days);
      }
    }
  }
  
  const avgHealthyToWarning = healthyToWarning.length > 0
    ? Math.round(healthyToWarning.reduce((sum, t) => sum + t.daysInPreviousStatus, 0) / healthyToWarning.length)
    : null;
    
  const avgWarningToBurned = warningToBurned.length > 0
    ? Math.round(warningToBurned.reduce((sum, t) => sum + t.daysInPreviousStatus, 0) / warningToBurned.length)
    : null;
    
  const avgTotalLifespan = totalLifespans.length > 0
    ? Math.round(totalLifespans.reduce((sum, d) => sum + d, 0) / totalLifespans.length)
    : null;
  
  return {
    avgDaysHealthyToWarning: avgHealthyToWarning,
    avgDaysWarningToBurned: avgWarningToBurned,
    avgTotalLifespan: avgTotalLifespan,
    accountsTracked: accountIds.length,
    transitionsTracked: transitions.length,
  };
}

// Calculate trend for an account
export function calculateAccountTrend(accountId: number): AccountTrend | null {
  const snapshots = getAccountSnapshots(accountId);
  
  if (snapshots.length === 0) return null;
  
  const replyRates = snapshots.map(s => ({
    date: s.date,
    rate: s.replyRate,
  }));
  
  // Need at least 2 data points for trend
  if (replyRates.length < 2) {
    return {
      accountId,
      email: snapshots[0].email,
      trend: 'stable',
      replyRateChange: 0,
      replyRates,
    };
  }
  
  // Compare first and last (or first week vs last available)
  const oldest = replyRates[0];
  const newest = replyRates[replyRates.length - 1];
  
  const change = newest.rate - oldest.rate;
  const threshold = 0.5; // 0.5% change threshold
  
  let trend: 'improving' | 'stable' | 'declining';
  if (change > threshold) {
    trend = 'improving';
  } else if (change < -threshold) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }
  
  return {
    accountId,
    email: snapshots[0].email,
    trend,
    replyRateChange: Math.round(change * 100) / 100,
    replyRates,
  };
}

// Get all account trends
export function getAllAccountTrends(): AccountTrend[] {
  const history = loadAccountHistory();
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  
  const trends: AccountTrend[] = [];
  for (const accountId of accountIds) {
    const trend = calculateAccountTrend(accountId);
    if (trend) {
      trends.push(trend);
    }
  }
  
  return trends;
}

// Predict accounts at risk of burning
export function predictAtRiskAccounts(days: number = 7): Array<{
  accountId: number;
  email: string;
  currentStatus: 'healthy' | 'warning' | 'burned';
  currentReplyRate: number;
  riskLevel: 'high' | 'medium' | 'low';
  reason: string;
}> {
  const history = loadAccountHistory();
  const today = getTodayDate();
  
  // Get latest snapshot for each account
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  const atRisk: Array<{
    accountId: number;
    email: string;
    currentStatus: 'healthy' | 'warning' | 'burned';
    currentReplyRate: number;
    riskLevel: 'high' | 'medium' | 'low';
    reason: string;
  }> = [];
  
  for (const accountId of accountIds) {
    const snapshots = history.snapshots
      .filter(s => s.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first
    
    if (snapshots.length === 0) continue;
    
    const latest = snapshots[0];
    
    // Skip already burned accounts
    if (latest.status === 'burned') continue;
    
    // Analyze trend
    const trend = calculateAccountTrend(accountId);
    
    // High risk: warning status with declining trend
    if (latest.status === 'warning' && trend?.trend === 'declining') {
      atRisk.push({
        accountId,
        email: latest.email,
        currentStatus: latest.status,
        currentReplyRate: latest.replyRate,
        riskLevel: 'high',
        reason: 'Warning status with declining reply rate',
      });
      continue;
    }
    
    // High risk: reply rate below 1.5% and declining
    if (latest.replyRate < 1.5 && trend?.trend === 'declining') {
      atRisk.push({
        accountId,
        email: latest.email,
        currentStatus: latest.status,
        currentReplyRate: latest.replyRate,
        riskLevel: 'high',
        reason: `Low reply rate (${latest.replyRate}%) and declining`,
      });
      continue;
    }
    
    // Medium risk: warning status
    if (latest.status === 'warning') {
      atRisk.push({
        accountId,
        email: latest.email,
        currentStatus: latest.status,
        currentReplyRate: latest.replyRate,
        riskLevel: 'medium',
        reason: 'Warning status',
      });
      continue;
    }
    
    // Medium risk: healthy but with significant decline
    if (latest.status === 'healthy' && trend && trend.replyRateChange < -1) {
      atRisk.push({
        accountId,
        email: latest.email,
        currentStatus: latest.status,
        currentReplyRate: latest.replyRate,
        riskLevel: 'medium',
        reason: `Reply rate dropped ${Math.abs(trend.replyRateChange)}%`,
      });
    }
  }
  
  return atRisk.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
}

// Get overall reply rate trend (average across all accounts)
export function getOverallReplyRateTrend(): { date: string; avgRate: number }[] {
  const history = loadAccountHistory();
  const dates = getHistoryDates();
  
  return dates.map(date => {
    const daySnapshots = history.snapshots.filter(s => s.date === date);
    const withSends = daySnapshots.filter(s => s.emailsSent > 0);
    
    if (withSends.length === 0) {
      return { date, avgRate: 0 };
    }
    
    const avgRate = withSends.reduce((sum, s) => sum + s.replyRate, 0) / withSends.length;
    return { date, avgRate: Math.round(avgRate * 100) / 100 };
  });
}

// Get days since account was created (for "Days Active" column)
export function getDaysActive(createdAt: string | undefined): number {
  if (!createdAt) return 0;
  
  try {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

// Initialize history with current data (call on first load)
export function initializeHistoryIfNeeded(
  accounts: Array<{
    id: number;
    email: string;
    replyRate: number;
    sentLast7Days?: number;
    totalSent?: number;
    repliesLast7Days?: number;
    totalReplies?: number;
    status: 'healthy' | 'warning' | 'burned';
    dailyLimit: number;
  }>
): void {
  const history = loadAccountHistory();
  
  // If we have no history at all, take first snapshot
  if (history.snapshots.length === 0 && accounts.length > 0) {
    takeSnapshot(accounts);
  }
}

// Hook-style function to get history data
export function useAccountHistory() {
  const history = loadAccountHistory();
  const lifespanStats = calculateLifespanStats();
  const recentlyDegraded = getRecentlyDegraded(7);
  const atRiskAccounts = predictAtRiskAccounts(7);
  const overallTrend = getOverallReplyRateTrend();
  
  return {
    history,
    lifespanStats,
    recentlyDegraded,
    atRiskAccounts,
    overallTrend,
    takeSnapshot,
    initializeHistoryIfNeeded,
    getDaysActive,
    calculateAccountTrend,
    getAllAccountTrends,
  };
}
