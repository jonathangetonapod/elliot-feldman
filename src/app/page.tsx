"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockDashboardStats, getMockDomainHealth, generateMockEmails } from "@/lib/mock-data";
import { useBisonData } from "@/lib/use-bison-data";
import { Recommendations } from "@/components/recommendations";
import { useState, useEffect, useMemo, Suspense, memo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  takeSnapshot,
  calculateLifespanStats,
  getRecentlyDegraded,
  getOverallReplyRateTrend,
  type LifespanStats,
  type StatusTransition,
} from "@/lib/account-history";
import Link from "next/link";

// Helper to format time ago
function formatTimeAgo(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  
  return "Over a day ago";
}

// Helper to get reply rate color
function getReplyRateColor(rate: number): { bg: string; text: string; indicator: string } {
  if (rate >= 2.5) return { bg: "bg-green-100", text: "text-green-700", indicator: "bg-green-500" };
  if (rate >= 1.5) return { bg: "bg-yellow-100", text: "text-yellow-700", indicator: "bg-yellow-500" };
  return { bg: "bg-red-100", text: "text-red-700", indicator: "bg-red-500" };
}

// Trend indicator component
function TrendIndicator({ trend, value }: { trend: 'up' | 'down' | 'stable'; value?: string }) {
  const icons = {
    up: (
      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ),
    down: (
      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    ),
    stable: (
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    ),
  };
  
  return (
    <div className="flex items-center gap-1">
      {icons[trend]}
      {value && <span className={`text-xs ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>{value}</span>}
    </div>
  );
}

// Progress bar component
function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// Loading skeleton components for progressive loading
function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 lg:p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-20"></div>
        </div>
        <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-24"></div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-2 px-3 lg:px-6">
        <CardTitle className="text-sm lg:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 lg:px-6">
        <div className="h-48 lg:h-64 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-2">
            <div className="w-24 h-24 bg-gray-200 rounded-full"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="p-4 lg:p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Chart colors
const COLORS = {
  critical: "#ef4444",
  warning: "#eab308",
  healthy: "#22c55e",
  warmupOn: "#f97316",
  warmupOff: "#9ca3af",
};

export default function Dashboard() {
  const { stats: bisonStats, emails: bisonEmails, domains: bisonDomains, loading, error, connected, lastFetched, refetch } = useBisonData();
  const [lastSyncDisplay, setLastSyncDisplay] = useState<string>("Loading...");
  const [lifespanStats, setLifespanStats] = useState<LifespanStats | null>(null);
  const [recentlyDegraded, setRecentlyDegraded] = useState<StatusTransition[]>([]);
  const [overallTrend, setOverallTrend] = useState<{ date: string; avgRate: number }[]>([]);
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || !bisonStats;
  const stats = useMockData ? getMockDashboardStats() : bisonStats;
  const domains = useMockData ? getMockDomainHealth() : bisonDomains;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  
  // Update last sync display every minute
  useEffect(() => {
    const updateSyncDisplay = () => {
      if (useMockData) {
        setLastSyncDisplay("Demo data");
      } else {
        setLastSyncDisplay(formatTimeAgo(lastFetched));
      }
    };
    
    updateSyncDisplay();
    const interval = setInterval(updateSyncDisplay, 60000);
    return () => clearInterval(interval);
  }, [lastFetched, useMockData]);
  
  // Take snapshot and load history when emails are available
  useEffect(() => {
    if (loading || emails.length === 0) return;
    
    // Transform emails to the format expected by takeSnapshot
    const accountData = emails.map(e => ({
      id: e.id,
      email: e.email,
      replyRate: e.replyRate,
      sentLast7Days: e.sentLast7Days,
      repliesLast7Days: e.repliesLast7Days,
      status: e.status,
      dailyLimit: e.dailyLimit,
    }));
    
    // Take snapshot (will only save once per day)
    takeSnapshot(accountData);
    
    // Load history data
    setLifespanStats(calculateLifespanStats());
    setRecentlyDegraded(getRecentlyDegraded(7));
    setOverallTrend(getOverallReplyRateTrend());
  }, [loading, emails]);
  
  // Calculate overall reply rate trend direction
  const replyRateTrend = useMemo(() => {
    if (overallTrend.length < 2) return 'stable' as const;
    const first = overallTrend[0]?.avgRate ?? 0;
    const last = overallTrend[overallTrend.length - 1]?.avgRate ?? 0;
    const change = last - first;
    if (change > 0.3) return 'up' as const;
    if (change < -0.3) return 'down' as const;
    return 'stable' as const;
  }, [overallTrend]);
  
  // Memoize expensive calculations to prevent re-computation on every render
  
  // Get recent issues (burned + warning emails)
  const recentIssues = useMemo(() => 
    emails.filter(e => e.status !== 'healthy').slice(0, 5),
    [emails]
  );
  
  // Get flagged domains
  const flaggedDomains = useMemo(() => 
    domains.filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5).slice(0, 5),
    [domains]
  );
    
  // Calculate warmup completion percentage
  const warmupCompletion = useMemo(() => 
    stats.totalEmails > 0 ? Math.round((stats.readyEmails / stats.totalEmails) * 100) : 0,
    [stats.totalEmails, stats.readyEmails]
  );
    
  // Accounts needing attention
  const accountsNeedingAttention = useMemo(() => 
    stats.warningEmails + stats.burnedEmails,
    [stats.warningEmails, stats.burnedEmails]
  );
  
  // Reply rate color
  const replyRateColors = useMemo(() => 
    getReplyRateColor(stats.avgReplyRate),
    [stats.avgReplyRate]
  );

  // Calculate chart data - all memoized for performance
  const { criticalAccounts, warningAccounts, healthyAccounts } = useMemo(() => ({
    criticalAccounts: emails.filter(e => e.replyRate < 1),
    warningAccounts: emails.filter(e => e.replyRate >= 1 && e.replyRate <= 2),
    healthyAccounts: emails.filter(e => e.replyRate > 2),
  }), [emails]);

  // Pie chart data for reply rate distribution
  const replyRateDistributionData = useMemo(() => [
    { name: "Critical (<1%)", value: criticalAccounts.length, color: COLORS.critical },
    { name: "Warning (1-2%)", value: warningAccounts.length, color: COLORS.warning },
    { name: "Healthy (>2%)", value: healthyAccounts.length, color: COLORS.healthy },
  ].filter(item => item.value > 0), [criticalAccounts.length, warningAccounts.length, healthyAccounts.length]);

  // Donut chart data for warmup status
  const { warmupOn, warmupOff, warmupStatusData } = useMemo(() => {
    const warmupOn = emails.filter(e => e.warmupStatus === 'warming');
    const warmupOff = emails.filter(e => e.warmupStatus !== 'warming');
    return {
      warmupOn,
      warmupOff,
      warmupStatusData: [
        { name: "Warmup ON", value: warmupOn.length, color: COLORS.warmupOn },
        { name: "Warmup OFF", value: warmupOff.length, color: COLORS.warmupOff },
      ].filter(item => item.value > 0),
    };
  }, [emails]);

  // Bar chart data for top 10 accounts by reply rate
  const top10ByReplyRate = useMemo(() => [...emails]
    .filter(e => e.sentLast7Days > 0)
    .sort((a, b) => b.replyRate - a.replyRate)
    .slice(0, 10)
    .map(e => ({
      name: e.email.split('@')[0].slice(0, 10),
      replyRate: e.replyRate,
      fill: e.replyRate > 2 ? COLORS.healthy : e.replyRate >= 1 ? COLORS.warning : COLORS.critical,
    })), [emails]);

  // Bottom 10 accounts (worst performing)
  const bottom10ByReplyRate = useMemo(() => [...emails]
    .filter(e => e.sentLast7Days > 0)
    .sort((a, b) => a.replyRate - b.replyRate)
    .slice(0, 10)
    .map(e => ({
      name: e.email.split('@')[0].slice(0, 10),
      replyRate: e.replyRate,
      fill: e.replyRate > 2 ? COLORS.healthy : e.replyRate >= 1 ? COLORS.warning : COLORS.critical,
    })), [emails]);

  return (
    <div className="p-4 lg:p-8">
      {/* Header with Last Synced Indicator */}
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">Email infrastructure health overview</p>
          </div>
          {/* Connection Status + Last Synced */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Last synced: {lastSyncDisplay}</span>
              {!loading && connected && (
                <button 
                  onClick={() => refetch()}
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  Refresh
                </button>
              )}
            </div>
            {loading && emails.length === 0 ? (
              <Badge variant="outline" className="text-xs">
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5 animate-pulse"></span>
                Loading...
              </Badge>
            ) : loading && emails.length > 0 ? (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1.5 animate-pulse"></span>
                Refreshing...
              </Badge>
            ) : connected && !error ? (
              <Badge variant="outline" className="text-xs border-green-200 text-green-700">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                Live Data
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700" title={error || 'API not configured'}>
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5"></span>
                Demo Mode
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      {/* Stats Grid - Show immediately with cached data or loading skeletons */}
      {loading && emails.length === 0 ? (
        // Full loading state only when no cached data
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
          {[1, 2, 3, 4].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Big Numbers Section */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
            {/* Total Accounts */}
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">📧</span>
                  <span className="text-sm text-blue-600 font-medium">Total Accounts</span>
                </div>
                <div className="text-3xl lg:text-4xl font-bold text-blue-700">
                  {stats.totalEmails.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            {/* Reply Rate */}
            <Card className={`hover:shadow-lg transition-shadow ${
              stats.avgReplyRate >= 2 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
              stats.avgReplyRate >= 1 ? "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200" :
              "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
            }`}>
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">💬</span>
                  <span className={`text-sm font-medium ${replyRateColors.text}`}>Reply Rate</span>
                </div>
                <div className={`text-3xl lg:text-4xl font-bold ${replyRateColors.text}`}>
                  {stats.avgReplyRate}%
                </div>
                <TrendIndicator trend={replyRateTrend} value={overallTrend.length >= 2 ? `${overallTrend.length}d trend` : "7d avg"} />
              </CardContent>
            </Card>

            {/* Warmup Progress */}
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🔥</span>
                  <span className="text-sm text-orange-600 font-medium">Warmup Ready</span>
                </div>
                <div className="text-3xl lg:text-4xl font-bold text-orange-700">
                  {warmupCompletion}%
                </div>
                <div className="text-xs text-orange-600 mt-1">
                  {stats.readyEmails} / {stats.totalEmails} accounts
                </div>
              </CardContent>
            </Card>

            {/* Needs Attention */}
            <Card className={`hover:shadow-lg transition-shadow ${
              accountsNeedingAttention === 0 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
              accountsNeedingAttention <= 5 ? "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200" :
              "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
            }`}>
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{accountsNeedingAttention === 0 ? "✅" : "⚠️"}</span>
                  <span className={`text-sm font-medium ${
                    accountsNeedingAttention === 0 ? "text-green-600" :
                    accountsNeedingAttention <= 5 ? "text-yellow-600" : "text-red-600"
                  }`}>Needs Attention</span>
                </div>
                <div className={`text-3xl lg:text-4xl font-bold ${
                  accountsNeedingAttention === 0 ? "text-green-700" :
                  accountsNeedingAttention <= 5 ? "text-yellow-700" : "text-red-700"
                }`}>
                  {accountsNeedingAttention}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {stats.burnedEmails} 🔴 + {stats.warningEmails} 🟡
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lifespan & Recently Degraded Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
            {/* Avg Account Lifespan */}
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">⏱️</span>
                    <span className="text-sm text-purple-600 font-medium">Avg Account Lifespan</span>
                  </div>
                  <Link href="/trends" className="text-xs text-purple-600 hover:text-purple-800 underline">
                    View Trends →
                  </Link>
                </div>
                {lifespanStats ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl lg:text-3xl font-bold text-purple-700">
                        {lifespanStats.avgDaysHealthyToWarning ?? '—'}
                      </div>
                      <div className="text-xs text-purple-600">🟢→🟡 days</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl lg:text-3xl font-bold text-purple-700">
                        {lifespanStats.avgDaysWarningToBurned ?? '—'}
                      </div>
                      <div className="text-xs text-purple-600">🟡→🔴 days</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl lg:text-3xl font-bold text-purple-700">
                        {lifespanStats.avgTotalLifespan ?? '—'}
                      </div>
                      <div className="text-xs text-purple-600">total days</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-purple-600 text-sm">
                    Building history... Check back tomorrow for trends.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recently Degraded */}
            <Card className={`hover:shadow-lg transition-shadow ${recentlyDegraded.length > 0 ? 'border-orange-200' : ''}`}>
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{recentlyDegraded.length > 0 ? '📉' : '✨'}</span>
                    <span className="text-sm text-gray-700 font-medium">Recently Degraded</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Last 7 days
                  </Badge>
                </div>
                {recentlyDegraded.length > 0 ? (
                  <div className="space-y-2">
                    {recentlyDegraded.slice(0, 3).map((transition, index) => (
                      <div 
                        key={`${transition.accountId}-${transition.date}`}
                        className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                          transition.toStatus === 'burned' ? 'bg-red-50' : 'bg-yellow-50'
                        }`}
                      >
                        <span className="truncate flex-1 mr-2">{transition.email}</span>
                        <span className="text-xs shrink-0">
                          {transition.fromStatus === 'healthy' ? '🟢' : '🟡'} → {transition.toStatus === 'burned' ? '🔴' : '🟡'}
                        </span>
                      </div>
                    ))}
                    {recentlyDegraded.length > 3 && (
                      <Link href="/trends" className="text-xs text-blue-600 hover:text-blue-800 block text-center">
                        +{recentlyDegraded.length - 3} more → View all
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No accounts degraded in the last 7 days 🎉
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
            {/* Pie Chart - Reply Rate Distribution */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  📊 Reply Rate Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <div className="h-48 lg:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={replyRateDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ value }) => `${value}`}
                        labelLine={false}
                      >
                        {replyRateDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} accounts`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Quick Legend - always visible */}
                <div className="flex justify-center gap-2 lg:gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-red-500"></span>
                    🔴 {criticalAccounts.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-yellow-500"></span>
                    🟡 {warningAccounts.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-green-500"></span>
                    🟢 {healthyAccounts.length}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Donut Chart - Warmup Status */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  🔥 Warmup Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <div className="h-48 lg:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={warmupStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ value }) => `${value}`}
                        labelLine={false}
                      >
                        {warmupStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} accounts`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Center text for donut */}
                <div className="text-center text-xs lg:text-sm text-gray-600 -mt-4">
                  <span className="font-bold text-orange-600">{warmupOn.length}</span> ON / <span className="text-gray-400">{warmupOff.length}</span> OFF
                </div>
              </CardContent>
            </Card>

            {/* Daily Limit Distribution */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  📈 Warmup Progress Stages
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <div className="space-y-4">
                  {/* Daily limit tiers */}
                  {(() => {
                    const earlyWarmup = emails.filter(e => e.dailyLimit >= 5 && e.dailyLimit <= 10);
                    const midWarmup = emails.filter(e => e.dailyLimit >= 11 && e.dailyLimit <= 20);
                    const lateWarmup = emails.filter(e => e.dailyLimit >= 21 && e.dailyLimit <= 35);
                    const fullyWarmed = emails.filter(e => e.dailyLimit >= 36 && e.dailyLimit <= 50);
                    const total = emails.length || 1;
                    
                    return (
                      <>
                        <div className="space-y-3">
                          {/* Stage: Early (5-10) */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="flex items-center gap-1">
                                <span className="text-lg">🔴</span>
                                Early (5-10/day)
                              </span>
                              <span className="font-bold text-red-600">{earlyWarmup.length}</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500 rounded-full transition-all duration-500"
                                style={{ width: `${(earlyWarmup.length / total) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Stage: Growing (11-20) */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="flex items-center gap-1">
                                <span className="text-lg">🟠</span>
                                Growing (11-20/day)
                              </span>
                              <span className="font-bold text-orange-600">{midWarmup.length}</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                                style={{ width: `${(midWarmup.length / total) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Stage: Maturing (21-35) */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="flex items-center gap-1">
                                <span className="text-lg">🟡</span>
                                Maturing (21-35/day)
                              </span>
                              <span className="font-bold text-yellow-600">{lateWarmup.length}</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                                style={{ width: `${(lateWarmup.length / total) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Stage: Ready (36-50) */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="flex items-center gap-1">
                                <span className="text-lg">🟢</span>
                                Ready (36-50/day)
                              </span>
                              <span className="font-bold text-green-600">{fullyWarmed.length}</span>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full transition-all duration-500"
                                style={{ width: `${(fullyWarmed.length / total) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Overall progress bar */}
                        <div className="pt-4 border-t">
                          <div className="text-sm text-gray-600 mb-2">Overall Warmup Progress</div>
                          <div className="h-5 rounded-full overflow-hidden flex bg-gray-200">
                            <div className="bg-red-500" style={{ width: `${(earlyWarmup.length / total) * 100}%` }} />
                            <div className="bg-orange-500" style={{ width: `${(midWarmup.length / total) * 100}%` }} />
                            <div className="bg-yellow-500" style={{ width: `${(lateWarmup.length / total) * 100}%` }} />
                            <div className="bg-green-500" style={{ width: `${(fullyWarmed.length / total) * 100}%` }} />
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bar Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
            {/* Top 10 Performers */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  🏆 Top 10 by Reply Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 lg:px-6">
                <div className="h-64 lg:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top10ByReplyRate} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" domain={[0, 'dataMax']} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Reply Rate']} />
                      <Bar dataKey="replyRate" radius={[0, 4, 4, 0]}>
                        {top10ByReplyRate.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Bottom 10 (Needs Attention) */}
            <Card className="hover:shadow-lg transition-shadow border-red-100">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  ⚠️ Bottom 10 - Needs Attention
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 lg:px-6">
                <div className="h-64 lg:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bottom10ByReplyRate} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" domain={[0, 'dataMax']} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Reply Rate']} />
                      <Bar dataKey="replyRate" radius={[0, 4, 4, 0]}>
                        {bottom10ByReplyRate.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Smart Recommendations */}
          <div className="mb-6 lg:mb-8">
            <Recommendations emails={emails} domains={domains} maxItems={5} />
          </div>

          {/* Quick Stats Section */}
          <Card className="mb-6 lg:mb-8">
            <CardHeader className="pb-2 lg:pb-4 px-4 lg:px-6">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <span>📊</span>
                Quick Stats
                <Badge variant="outline" className="ml-auto text-xs">Last 7 days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 lg:px-6 pb-4 lg:pb-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {/* Total Emails Sent */}
                <div className="p-3 lg:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs lg:text-sm text-gray-500">📤 Emails Sent</span>
                    <TrendIndicator trend="up" value="+12%" />
                  </div>
                  <div className="text-xl lg:text-2xl font-bold text-gray-900">
                    {stats.totalSentLast7Days.toLocaleString()}
                  </div>
                </div>
                
                {/* Total Replies */}
                <div className="p-3 lg:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs lg:text-sm text-gray-500">💬 Replies</span>
                    <TrendIndicator trend="up" value="+8%" />
                  </div>
                  <div className="text-xl lg:text-2xl font-bold text-gray-900">
                    {stats.totalRepliesLast7Days.toLocaleString()}
                  </div>
                </div>
                
                {/* Reply Rate */}
                <div className={`p-3 lg:p-4 rounded-lg ${replyRateColors.bg} hover:opacity-90 transition-opacity`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs lg:text-sm ${replyRateColors.text}`}>📈 Reply Rate</span>
                    <TrendIndicator trend="stable" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${replyRateColors.indicator}`}></div>
                    <span className={`text-xl lg:text-2xl font-bold ${replyRateColors.text}`}>
                      {stats.avgReplyRate}%
                    </span>
                  </div>
                </div>
                
                {/* Accounts Needing Attention */}
                <div className={`p-3 lg:p-4 rounded-lg ${accountsNeedingAttention > 0 ? 'bg-red-50' : 'bg-green-50'} hover:opacity-90 transition-opacity`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs lg:text-sm ${accountsNeedingAttention > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ⚠️ Need Attention
                    </span>
                    {accountsNeedingAttention > 0 && <TrendIndicator trend="down" />}
                  </div>
                  <div className={`text-xl lg:text-2xl font-bold ${accountsNeedingAttention > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {accountsNeedingAttention}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {stats.burnedEmails} burned + {stats.warningEmails} warning
                  </div>
                </div>
              </div>
              
              {/* Warmup Progress */}
              <div className="mt-4 lg:mt-6 p-3 lg:p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">🔥 Warmup Completion</span>
                  <span className="text-sm font-bold text-gray-900">{warmupCompletion}%</span>
                </div>
                <ProgressBar 
                  value={stats.readyEmails} 
                  max={stats.totalEmails} 
                  color={warmupCompletion >= 80 ? "bg-green-500" : warmupCompletion >= 50 ? "bg-yellow-500" : "bg-orange-500"}
                />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>✅ {stats.readyEmails} ready</span>
                  <span>🔥 {stats.warmingEmails} warming</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Domain Overview + Recent Issues */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
            <Card>
              <CardHeader className="px-4 lg:px-6">
                <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                  <span>🌐 Domain Overview</span>
                  <Badge variant="outline" className="text-xs">{stats.totalDomains} domains</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 lg:px-6">
                <div className="space-y-2 lg:space-y-3">
                  {flaggedDomains.length > 0 ? (
                    flaggedDomains.map(domain => (
                      <div key={domain.domain} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 lg:p-3 bg-red-50 rounded-lg border border-red-100 gap-2 hover:bg-red-100 transition-colors">
                        <div>
                          <div className="font-medium text-sm lg:text-base">{domain.domain}</div>
                          <div className="text-xs lg:text-sm text-gray-500">📧 {domain.totalEmails} emails</div>
                        </div>
                        <div className="flex gap-1 lg:gap-2 flex-wrap">
                          {domain.blacklistStatus === 'listed' && (
                            <Badge variant="destructive" className="text-xs">🚫 Blacklisted ({domain.blacklistCount})</Badge>
                          )}
                          {domain.spamScore > 5 && (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-700 text-xs">
                              ⚠️ Spam: {domain.spamScore}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 lg:py-8 text-gray-500">
                      <span className="text-4xl block mb-2">✅</span>
                      All domains healthy
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="px-4 lg:px-6">
                <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                  <span>🚨 Recent Issues</span>
                  <Badge variant="outline" className="border-red-200 text-red-700 text-xs">
                    {stats.warningEmails + stats.burnedEmails} total
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 lg:px-6">
                <div className="space-y-2 lg:space-y-3">
                  {recentIssues.length > 0 ? (
                    recentIssues.map(email => (
                      <div 
                        key={email.id} 
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 lg:p-3 rounded-lg border gap-2 hover:opacity-90 transition-opacity ${
                          email.status === 'burned' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-xs lg:text-sm truncate">{email.email}</div>
                          <div className="text-xs text-gray-500">
                            Reply rate: <span className={email.replyRate < 1 ? "text-red-600 font-bold" : "text-yellow-600 font-bold"}>{email.replyRate}%</span>
                          </div>
                        </div>
                        <Badge variant={email.status === 'burned' ? 'destructive' : 'outline'} 
                          className={`text-xs shrink-0 ${email.status === 'warning' ? 'border-yellow-500 text-yellow-700' : ''}`}>
                          {email.status === 'burned' ? '🔴' : '🟡'} {email.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 lg:py-8 text-gray-500">
                      <span className="text-4xl block mb-2">✅</span>
                      No issues found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Health Distribution Bar */}
          <Card>
            <CardHeader className="px-4 lg:px-6">
              <CardTitle className="text-base lg:text-lg">📊 Email Health Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="h-6 lg:h-8 rounded-full overflow-hidden flex shadow-inner">
                <div 
                  className="bg-green-500 transition-all hover:brightness-110" 
                  style={{ width: `${(stats.healthyEmails / stats.totalEmails) * 100}%` }}
                  title={`Healthy: ${stats.healthyEmails}`}
                />
                <div 
                  className="bg-yellow-500 transition-all hover:brightness-110" 
                  style={{ width: `${(stats.warningEmails / stats.totalEmails) * 100}%` }}
                  title={`Warning: ${stats.warningEmails}`}
                />
                <div 
                  className="bg-red-500 transition-all hover:brightness-110" 
                  style={{ width: `${(stats.burnedEmails / stats.totalEmails) * 100}%` }}
                  title={`Burned: ${stats.burnedEmails}`}
                />
              </div>
              <div className="flex flex-wrap justify-between mt-3 lg:mt-4 text-xs lg:text-sm gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-green-500 rounded-full"></div>
                  <span>🟢 Healthy ({stats.healthyEmails} - {((stats.healthyEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-yellow-500 rounded-full"></div>
                  <span>🟡 Warning ({stats.warningEmails} - {((stats.warningEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-red-500 rounded-full"></div>
                  <span>🔴 Burned ({stats.burnedEmails} - {((stats.burnedEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
