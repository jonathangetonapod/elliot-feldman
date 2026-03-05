"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  loadAccountHistory,
  calculateLifespanStats,
  getRecentlyDegraded,
  predictAtRiskAccounts,
  getOverallReplyRateTrend,
  detectStatusTransitions,
  getAllAccountTrends,
  takeSnapshot,
  type StatusTransition,
  type AccountTrend,
  type LifespanStats,
} from "@/lib/account-history";
import { useBisonData } from "@/lib/use-bison-data";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// Trend indicator component
function TrendIndicator({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  const config = {
    improving: { icon: '↑', color: 'text-green-600', bg: 'bg-green-100' },
    stable: { icon: '→', color: 'text-gray-600', bg: 'bg-gray-100' },
    declining: { icon: '↓', color: 'text-red-600', bg: 'bg-red-100' },
  };
  
  const { icon, color, bg } = config[trend];
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${bg} ${color}`}>
      {icon} {trend}
    </span>
  );
}

// Risk badge component
function RiskBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { emoji: '🔴', color: 'bg-red-100 text-red-700 border-red-200' },
    medium: { emoji: '🟡', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    low: { emoji: '🟢', color: 'bg-green-100 text-green-700 border-green-200' },
  };
  
  const { emoji, color } = config[level];
  
  return (
    <Badge variant="outline" className={color}>
      {emoji} {level}
    </Badge>
  );
}

// Status badge component
function StatusBadge({ status }: { status: 'healthy' | 'warning' | 'burned' }) {
  const config = {
    healthy: { emoji: '🟢', color: 'bg-green-100 text-green-700' },
    warning: { emoji: '🟡', color: 'bg-yellow-100 text-yellow-700' },
    burned: { emoji: '🔴', color: 'bg-red-100 text-red-700' },
  };
  
  const { emoji, color } = config[status];
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      {emoji} {status}
    </span>
  );
}

// Transition arrow component
function TransitionArrow({ from, to }: { from: string; to: string }) {
  const statusEmoji = {
    healthy: '🟢',
    warning: '🟡',
    burned: '🔴',
  };
  
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      {statusEmoji[from as keyof typeof statusEmoji]} → {statusEmoji[to as keyof typeof statusEmoji]}
    </span>
  );
}

// Mini sparkline component
function MiniSparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <span className="text-xs text-gray-400">No trend data</span>;
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const color = lastValue > firstValue ? '#22c55e' : lastValue < firstValue ? '#ef4444' : '#9ca3af';
  
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TrendsPage() {
  const { emails, loading: bisonLoading, connected } = useBisonData();
  const [mounted, setMounted] = useState(false);
  const [lifespanStats, setLifespanStats] = useState<LifespanStats | null>(null);
  const [recentlyDegraded, setRecentlyDegraded] = useState<StatusTransition[]>([]);
  const [atRiskAccounts, setAtRiskAccounts] = useState<ReturnType<typeof predictAtRiskAccounts>>([]);
  const [overallTrend, setOverallTrend] = useState<ReturnType<typeof getOverallReplyRateTrend>>([]);
  const [allTransitions, setAllTransitions] = useState<StatusTransition[]>([]);
  const [accountTrends, setAccountTrends] = useState<AccountTrend[]>([]);
  
  // Initialize and load history
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Take snapshot when emails load
  useEffect(() => {
    if (!mounted || bisonLoading || emails.length === 0) return;
    
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
    
    // Load all history data
    setLifespanStats(calculateLifespanStats());
    setRecentlyDegraded(getRecentlyDegraded(7));
    setAtRiskAccounts(predictAtRiskAccounts(7));
    setOverallTrend(getOverallReplyRateTrend());
    setAllTransitions(detectStatusTransitions());
    setAccountTrends(getAllAccountTrends());
  }, [mounted, bisonLoading, emails]);
  
  // Calculate trend stats
  const trendStats = useMemo(() => {
    const improving = accountTrends.filter(t => t.trend === 'improving').length;
    const stable = accountTrends.filter(t => t.trend === 'stable').length;
    const declining = accountTrends.filter(t => t.trend === 'declining').length;
    
    return { improving, stable, declining, total: accountTrends.length };
  }, [accountTrends]);
  
  // Calculate current status distribution
  const statusDistribution = useMemo(() => {
    const healthy = emails.filter(e => e.status === 'healthy').length;
    const warning = emails.filter(e => e.status === 'warning').length;
    const burned = emails.filter(e => e.status === 'burned').length;
    
    return { healthy, warning, burned, total: emails.length };
  }, [emails]);
  
  // History data availability
  const historyDays = overallTrend.length;
  const hasEnoughHistory = historyDays >= 2;
  
  if (!mounted || bisonLoading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📈 Trends</h1>
          <p className="text-gray-500 mt-1">Loading trend data...</p>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-3 text-gray-600">Analyzing account trends...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📈 Trends</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">
              Account health tracking and degradation analysis
            </p>
          </div>
          <Badge variant="outline" className="text-xs w-fit">
            {historyDays} day{historyDays !== 1 ? 's' : ''} of history
          </Badge>
        </div>
      </div>
      
      {/* Initial Data Notice */}
      {!hasEnoughHistory && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="font-semibold text-blue-900">Building History</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Trend analysis improves over time. We&apos;ve captured today&apos;s data as day 1.
                  Come back daily to build up trend history for better insights.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Lifespan Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⏱️</span>
              <span className="text-xs text-blue-600 uppercase tracking-wide font-medium">
                Healthy → Warning
              </span>
            </div>
            <div className="text-2xl lg:text-3xl font-bold text-blue-700">
              {lifespanStats?.avgDaysHealthyToWarning ?? '—'}
            </div>
            <div className="text-xs text-blue-600">avg days</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚠️</span>
              <span className="text-xs text-yellow-600 uppercase tracking-wide font-medium">
                Warning → Burned
              </span>
            </div>
            <div className="text-2xl lg:text-3xl font-bold text-yellow-700">
              {lifespanStats?.avgDaysWarningToBurned ?? '—'}
            </div>
            <div className="text-xs text-yellow-600">avg days</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📆</span>
              <span className="text-xs text-purple-600 uppercase tracking-wide font-medium">
                Total Lifespan
              </span>
            </div>
            <div className="text-2xl lg:text-3xl font-bold text-purple-700">
              {lifespanStats?.avgTotalLifespan ?? '—'}
            </div>
            <div className="text-xs text-purple-600">avg days to burn</div>
          </CardContent>
        </Card>
        
        <Card className={`${atRiskAccounts.length > 0 ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{atRiskAccounts.length > 0 ? '⚠️' : '✅'}</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${atRiskAccounts.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                At Risk (7d)
              </span>
            </div>
            <div className={`text-2xl lg:text-3xl font-bold ${atRiskAccounts.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {atRiskAccounts.length}
            </div>
            <div className={`text-xs ${atRiskAccounts.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              accounts may burn
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Trend Distribution & Overall Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
        {/* Trend Distribution */}
        <Card>
          <CardHeader className="pb-2 px-3 lg:px-6">
            <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
              📊 Account Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 lg:px-6">
            <div className="space-y-4">
              {/* Trend bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <span className="text-green-600">↑</span> Improving
                    </span>
                    <span className="font-bold text-green-600">{trendStats.improving}</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${trendStats.total > 0 ? (trendStats.improving / trendStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <span className="text-gray-600">→</span> Stable
                    </span>
                    <span className="font-bold text-gray-600">{trendStats.stable}</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-500 rounded-full transition-all duration-500"
                      style={{ width: `${trendStats.total > 0 ? (trendStats.stable / trendStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <span className="text-red-600">↓</span> Declining
                    </span>
                    <span className="font-bold text-red-600">{trendStats.declining}</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${trendStats.total > 0 ? (trendStats.declining / trendStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Current Status Summary */}
              <div className="pt-4 border-t">
                <div className="text-sm text-gray-600 mb-2">Current Status Distribution</div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    🟢 {statusDistribution.healthy}
                  </span>
                  <span className="flex items-center gap-1">
                    🟡 {statusDistribution.warning}
                  </span>
                  <span className="flex items-center gap-1">
                    🔴 {statusDistribution.burned}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Reply Rate Trend Chart */}
        <Card>
          <CardHeader className="pb-2 px-3 lg:px-6">
            <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
              💬 Reply Rate Over Time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 lg:px-6">
            {overallTrend.length > 1 ? (
              <div className="h-48 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overallTrend} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis 
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fontSize: 9 }}
                      domain={[0, 'auto']}
                      width={35}
                    />
                    <Tooltip 
                      formatter={(value) => [`${(value as number)?.toFixed(2) ?? 0}%`, 'Avg Reply Rate']}
                      labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avgRate" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 lg:h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <span className="text-3xl lg:text-4xl block mb-2">📊</span>
                  <p className="text-sm">Chart will appear after 2+ days of data</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* At Risk Accounts & Recently Degraded */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
        {/* At Risk Accounts */}
        <Card className={atRiskAccounts.length > 0 ? 'border-red-200' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              ⚠️ At Risk Accounts
              <Badge variant="outline" className="ml-auto text-xs">
                Next 7 days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskAccounts.length > 0 ? (
              <div className="space-y-3">
                {atRiskAccounts.slice(0, 10).map((account, index) => (
                  <div 
                    key={account.accountId}
                    className={`p-3 rounded-lg border ${
                      account.riskLevel === 'high' ? 'bg-red-50 border-red-200' :
                      account.riskLevel === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{account.email}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {account.reason}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <RiskBadge level={account.riskLevel} />
                        <span className="text-xs text-gray-500">
                          {account.currentReplyRate}% reply
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {atRiskAccounts.length > 10 && (
                  <div className="text-center text-sm text-gray-500">
                    +{atRiskAccounts.length - 10} more accounts
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <span className="text-4xl block mb-2">✅</span>
                No accounts at immediate risk
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Recently Degraded */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              📉 Recently Degraded
              <Badge variant="outline" className="ml-auto text-xs">
                Last 7 days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentlyDegraded.length > 0 ? (
              <div className="space-y-3">
                {recentlyDegraded.slice(0, 10).map((transition, index) => (
                  <div 
                    key={`${transition.accountId}-${transition.date}`}
                    className="p-3 rounded-lg border bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{transition.email}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          After {transition.daysInPreviousStatus} day{transition.daysInPreviousStatus !== 1 ? 's' : ''} as {transition.fromStatus}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <TransitionArrow from={transition.fromStatus} to={transition.toStatus} />
                        <span className="text-xs text-gray-500">
                          {new Date(transition.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {recentlyDegraded.length > 10 && (
                  <div className="text-center text-sm text-gray-500">
                    +{recentlyDegraded.length - 10} more transitions
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <span className="text-4xl block mb-2">✨</span>
                No degradations in the last 7 days
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Status Transition Timeline */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            🕐 Status Transition Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allTransitions.length > 0 ? (
            <div className="space-y-2">
              {allTransitions.slice(0, 15).map((transition, index) => (
                <div 
                  key={`${transition.accountId}-${transition.date}-${index}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="text-xs text-gray-400 w-20">
                    {new Date(transition.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <TransitionArrow from={transition.fromStatus} to={transition.toStatus} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate">{transition.email}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    after {transition.daysInPreviousStatus}d
                  </div>
                </div>
              ))}
              {allTransitions.length > 15 && (
                <div className="text-center text-sm text-gray-500 pt-2">
                  +{allTransitions.length - 15} more transitions
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl block mb-2">📊</span>
              No status transitions recorded yet. Check back after a few days.
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Declining Accounts Detail */}
      {trendStats.declining > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base lg:text-lg flex items-center gap-2">
              ↓ Declining Accounts
              <Badge variant="outline" className="ml-auto text-xs border-red-200 text-red-700">
                {trendStats.declining} accounts
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {accountTrends
                .filter(t => t.trend === 'declining')
                .sort((a, b) => a.replyRateChange - b.replyRateChange)
                .slice(0, 10)
                .map((account) => (
                  <div 
                    key={account.accountId}
                    className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{account.email}</div>
                      <div className="text-xs text-red-600 mt-1">
                        Reply rate dropped {Math.abs(account.replyRateChange)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MiniSparkline data={account.replyRates.map(r => r.rate)} />
                      <TrendIndicator trend="declining" />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
