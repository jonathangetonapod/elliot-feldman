"use client";

// Types for account history tracking
export interface AccountSnapshot {
  date: string; // YYYY-MM-DD
  accountId: number;
  email: string;
  replyRate: number;
  emailsSent: number;
  replies: number;
  dailyLimit: number;
}

export interface AccountHistoryData {
  snapshots: AccountSnapshot[];
  lastUpdated: string;
}

export interface StatusTransition {
  accountId: number;
  email: string;
  fromStatus: TrendHealth;
  toStatus: TrendHealth;
  date: string;
  daysInPreviousStatus: number;
}

// NEW: Trend-based health classification
export type TrendHealth = 'declining' | 'warning' | 'stable' | 'improving' | 'gathering-data';

export interface AccountTrend {
  accountId: number;
  email: string;
  trend: 'improving' | 'stable' | 'declining';
  replyRateChange: number; // % change over last 7 days
  replyRates: { date: string; rate: number }[];
}

// NEW: Historical trend analysis result
export interface HistoricalTrendAnalysis {
  accountId: number;
  email: string;
  health: TrendHealth;
  currentAvg: number;      // Last 7 days average
  baselineAvg: number;     // Previous 14 days average (days 8-21)
  percentChange: number;   // % change from baseline
  daysOfData: number;      // How many days of history we have
  trend: 'up' | 'down' | 'flat';
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
const MAX_DAYS_HISTORY = 60; // Extended for better trend analysis
const MINIMUM_DAYS_FOR_TREND = 7; // Minimum days needed to classify

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

// NEW: Calculate rolling average for a date range
function calculateRollingAverage(
  snapshots: AccountSnapshot[],
  startDaysAgo: number,
  endDaysAgo: number
): number | null {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - startDaysAgo);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - endDaysAgo);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const relevantSnapshots = snapshots.filter(s => 
    s.date >= endStr && s.date <= startStr
  );
  
  if (relevantSnapshots.length === 0) return null;
  
  const sum = relevantSnapshots.reduce((acc, s) => acc + s.replyRate, 0);
  return sum / relevantSnapshots.length;
}

// NEW: Analyze historical trend for an account
export function analyzeAccountTrend(accountId: number, currentReplyRate?: number): HistoricalTrendAnalysis | null {
  const snapshots = getAccountSnapshots(accountId);
  
  if (snapshots.length === 0) return null;
  
  const replyRates = snapshots.map(s => ({
    date: s.date,
    rate: s.replyRate,
  }));
  
  const daysOfData = snapshots.length;
  const email = snapshots[0].email;
  
  // Use current reply rate if provided, otherwise use latest snapshot
  const current = currentReplyRate ?? snapshots[snapshots.length - 1].replyRate;
  
  // If we don't have enough data, mark as gathering data
  if (daysOfData < MINIMUM_DAYS_FOR_TREND) {
    return {
      accountId,
      email,
      health: 'gathering-data',
      currentAvg: current,
      baselineAvg: 0,
      percentChange: 0,
      daysOfData,
      trend: 'flat',
      replyRates,
    };
  }
  
  // Calculate rolling averages
  // Current period: last 7 days (or all data if less)
  const currentAvg = calculateRollingAverage(snapshots, 0, 7) ?? current;
  
  // Baseline period: days 8-21 (14 day window before current period)
  const baselineAvg = calculateRollingAverage(snapshots, 8, 21);
  
  // If no baseline data, we're still gathering
  if (baselineAvg === null || baselineAvg === 0) {
    return {
      accountId,
      email,
      health: 'gathering-data',
      currentAvg,
      baselineAvg: 0,
      percentChange: 0,
      daysOfData,
      trend: 'flat',
      replyRates,
    };
  }
  
  // Calculate percent change from baseline
  const percentChange = ((currentAvg - baselineAvg) / baselineAvg) * 100;
  
  // Determine trend direction
  let trend: 'up' | 'down' | 'flat';
  if (percentChange > 10) {
    trend = 'up';
  } else if (percentChange < -10) {
    trend = 'down';
  } else {
    trend = 'flat';
  }
  
  // Determine health classification based on trend
  let health: TrendHealth;
  if (percentChange <= -50) {
    // Dropped more than 50% from baseline = Declining
    health = 'declining';
  } else if (percentChange <= -25) {
    // Dropped 25-50% from baseline = Warning
    health = 'warning';
  } else if (percentChange >= 25) {
    // Increased 25%+ from baseline = Improving
    health = 'improving';
  } else {
    // Within +/- 25% of baseline = Stable
    health = 'stable';
  }
  
  return {
    accountId,
    email,
    health,
    currentAvg: Math.round(currentAvg * 100) / 100,
    baselineAvg: Math.round(baselineAvg * 100) / 100,
    percentChange: Math.round(percentChange),
    daysOfData,
    trend,
    replyRates,
  };
}

// NEW: Get trend analysis for all accounts
export function getAllAccountTrendAnalysis(
  accounts: Array<{ id: number; replyRate: number }>
): Map<number, HistoricalTrendAnalysis> {
  const results = new Map<number, HistoricalTrendAnalysis>();
  
  for (const account of accounts) {
    const analysis = analyzeAccountTrend(account.id, account.replyRate);
    if (analysis) {
      results.set(account.id, analysis);
    }
  }
  
  return results;
}

// NEW: Get health classification label and emoji
export function getHealthLabel(health: TrendHealth): { emoji: string; label: string; color: string } {
  switch (health) {
    case 'declining':
      return { emoji: '🔴', label: 'Declining', color: 'text-red-600' };
    case 'warning':
      return { emoji: '🟡', label: 'Warning', color: 'text-yellow-600' };
    case 'stable':
      return { emoji: '🟢', label: 'Stable', color: 'text-green-600' };
    case 'improving':
      return { emoji: '📈', label: 'Improving', color: 'text-blue-600' };
    case 'gathering-data':
      return { emoji: '📊', label: 'Gathering Data', color: 'text-gray-500' };
  }
}

// Detect status transitions (for lifespan tracking)
export function detectStatusTransitions(): StatusTransition[] {
  const history = loadAccountHistory();
  const dates = getHistoryDates();
  
  if (dates.length < 2) return [];
  
  const transitions: StatusTransition[] = [];
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  
  // We'll track health changes over time using trend analysis
  // This is simplified - a full implementation would store health in snapshots
  
  return transitions.sort((a, b) => b.date.localeCompare(a.date));
}

// Get recently degraded accounts (based on trend analysis)
export function getRecentlyDegraded(days: number = 7): Array<{
  accountId: number;
  email: string;
  fromStatus: TrendHealth;
  toStatus: TrendHealth;
  percentDrop: number;
}> {
  const history = loadAccountHistory();
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  const degraded: Array<{
    accountId: number;
    email: string;
    fromStatus: TrendHealth;
    toStatus: TrendHealth;
    percentDrop: number;
  }> = [];
  
  for (const accountId of accountIds) {
    const analysis = analyzeAccountTrend(accountId);
    if (analysis && (analysis.health === 'declining' || analysis.health === 'warning')) {
      degraded.push({
        accountId,
        email: analysis.email,
        fromStatus: 'stable',
        toStatus: analysis.health,
        percentDrop: Math.abs(analysis.percentChange),
      });
    }
  }
  
  return degraded.sort((a, b) => b.percentDrop - a.percentDrop);
}

// Predict accounts at risk (based on trend analysis)
export function predictAtRiskAccounts(days: number = 7): Array<{
  accountId: number;
  email: string;
  currentReplyRate: number;
  riskLevel: 'high' | 'medium' | 'low';
  reason: string;
  health: TrendHealth;
  percentChange: number;
}> {
  const history = loadAccountHistory();
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  const atRisk: Array<{
    accountId: number;
    email: string;
    currentReplyRate: number;
    riskLevel: 'high' | 'medium' | 'low';
    reason: string;
    health: TrendHealth;
    percentChange: number;
  }> = [];
  
  for (const accountId of accountIds) {
    const analysis = analyzeAccountTrend(accountId);
    if (!analysis) continue;
    
    let riskLevel: 'high' | 'medium' | 'low' = 'low';
    let reason = '';
    
    if (analysis.health === 'declining') {
      riskLevel = 'high';
      reason = `Reply rate dropped ${Math.abs(analysis.percentChange)}% from baseline`;
    } else if (analysis.health === 'warning') {
      riskLevel = 'medium';
      reason = `Reply rate down ${Math.abs(analysis.percentChange)}% - moderate decline`;
    } else if (analysis.health === 'gathering-data') {
      continue; // Skip accounts still gathering data
    } else {
      continue; // Skip healthy/improving accounts
    }
    
    atRisk.push({
      accountId,
      email: analysis.email,
      currentReplyRate: analysis.currentAvg,
      riskLevel,
      reason,
      health: analysis.health,
      percentChange: analysis.percentChange,
    });
  }
  
  return atRisk.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
}

// Calculate lifespan statistics
export function calculateLifespanStats(): LifespanStats {
  const history = loadAccountHistory();
  const accountIds = [...new Set(history.snapshots.map(s => s.accountId))];
  
  return {
    avgDaysHealthyToWarning: null,
    avgDaysWarningToBurned: null,
    avgTotalLifespan: null,
    accountsTracked: accountIds.length,
    transitionsTracked: 0,
  };
}

// Calculate trend for an account (legacy compatibility)
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

// Get all account trends (legacy compatibility)
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
  const overallTrend = getOverallReplyRateTrend();
  
  return {
    history,
    lifespanStats,
    overallTrend,
    takeSnapshot,
    initializeHistoryIfNeeded,
    getDaysActive,
    calculateAccountTrend,
    getAllAccountTrends,
    analyzeAccountTrend,
    getAllAccountTrendAnalysis,
    getHealthLabel,
  };
}
