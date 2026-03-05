"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import {
  getHealthLabel,
  type HistoricalTrendAnalysis,
} from "@/lib/account-history";

// Types
export interface AccountDetailData {
  id: number;
  email: string;
  name: string;
  domain: string;
  status: string;
  
  // Warmup info
  warmupEnabled: boolean;
  warmupStatus: "warming" | "ready" | "paused";
  warmupDay: number;
  dailyLimit: number;
  currentVolume?: number;
  
  // Reply stats
  replyRate: number;
  totalSent: number;
  totalReplies: number;
  sentLast7Days: number;
  repliesLast7Days: number;
  
  // Timestamps
  createdAt: string;
  lastSyncedAt?: string;
  
  // Trend analysis (if available)
  trendAnalysis: HistoricalTrendAnalysis | null;
}

interface AccountDetailModalProps {
  account: AccountDetailData | null;
  isOpen: boolean;
  onClose: () => void;
}

// Format date helper
function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch {
    return dateStr;
  }
}

// Calculate days since creation
function getDaysActive(createdAt: string): number {
  try {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

// Stat card component
function StatCard({ label, value, subValue, icon, color = "gray" }: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: string;
  color?: "gray" | "green" | "yellow" | "red" | "blue" | "orange" | "purple";
}) {
  const colorClasses = {
    gray: "bg-gray-50 border-gray-200",
    green: "bg-green-50 border-green-200",
    yellow: "bg-yellow-50 border-yellow-200",
    red: "bg-red-50 border-red-200",
    blue: "bg-blue-50 border-blue-200",
    orange: "bg-orange-50 border-orange-200",
    purple: "bg-purple-50 border-purple-200",
  };
  
  const textColorClasses = {
    gray: "text-gray-700",
    green: "text-green-700",
    yellow: "text-yellow-700",
    red: "text-red-700",
    blue: "text-blue-700",
    orange: "text-orange-700",
    purple: "text-purple-700",
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div className={`text-xl font-bold ${textColorClasses[color]}`}>{value}</div>
      {subValue && <div className="text-xs text-gray-500 mt-0.5">{subValue}</div>}
    </div>
  );
}

// Trend chart component
function TrendChart({ data, baselineAvg }: { 
  data: { date: string; rate: number }[]; 
  baselineAvg: number;
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        displayDate: formatDate(d.date, { month: 'short', day: 'numeric' }),
        rate: d.rate,
      }));
  }, [data]);

  if (chartData.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <span className="text-4xl block mb-2">📊</span>
          <span>Gathering trend data...</span>
          <div className="text-xs mt-1">{chartData.length} day(s) of data</div>
        </div>
      </div>
    );
  }

  // Determine trend color
  const firstValue = chartData[0]?.rate || 0;
  const lastValue = chartData[chartData.length - 1]?.rate || 0;
  const isUp = lastValue > firstValue + 0.3;
  const isDown = lastValue < firstValue - 0.3;
  const color = isUp ? '#22c55e' : isDown ? '#ef4444' : '#3b82f6';

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis 
            dataKey="displayDate" 
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            interval="preserveStartEnd"
          />
          <YAxis 
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Reply Rate']}
            labelFormatter={(label) => `Date: ${label}`}
            contentStyle={{ 
              borderRadius: '8px', 
              border: '1px solid #e5e7eb',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          />
          {baselineAvg > 0 && (
            <ReferenceLine 
              y={baselineAvg} 
              stroke="#9ca3af" 
              strokeDasharray="5 5" 
              label={{ 
                value: `Baseline: ${baselineAvg}%`, 
                position: 'right',
                fontSize: 10,
                fill: '#9ca3af'
              }} 
            />
          )}
          <Area 
            type="monotone" 
            dataKey="rate" 
            fill="url(#trendGradient)"
            stroke="none"
          />
          <Line 
            type="monotone" 
            dataKey="rate" 
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 6, stroke: color, strokeWidth: 2, fill: 'white' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Warmup progress bar
function WarmupProgressBar({ dailyLimit, warmupEnabled }: { dailyLimit: number; warmupEnabled: boolean }) {
  // Stages: 5-10 (🔴) → 11-20 (🟠) → 21-35 (🟡) → 36-50 (🟢)
  const stages = [
    { min: 5, max: 10, emoji: "🔴", label: "Starting", color: "bg-red-500" },
    { min: 11, max: 20, emoji: "🟠", label: "Growing", color: "bg-orange-500" },
    { min: 21, max: 35, emoji: "🟡", label: "Maturing", color: "bg-yellow-500" },
    { min: 36, max: 50, emoji: "🟢", label: "Ready", color: "bg-green-500" },
  ];

  const currentStageIndex = dailyLimit <= 10 ? 0 : dailyLimit <= 20 ? 1 : dailyLimit <= 35 ? 2 : 3;
  const progress = Math.min((dailyLimit / 50) * 100, 100);

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${stages[currentStageIndex].color}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Stage indicators */}
      <div className="flex justify-between text-xs">
        {stages.map((stage, idx) => (
          <div 
            key={idx}
            className={`flex items-center gap-1 ${
              idx <= currentStageIndex && warmupEnabled ? 'text-gray-700' : 'text-gray-400'
            }`}
          >
            <span>{stage.emoji}</span>
            <span className="hidden sm:inline">{stage.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity timeline item
function TimelineItem({ date, event, icon }: { date: string; event: string; icon: string }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-l-2 border-gray-200 pl-4 ml-2 relative">
      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-xs">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-700">{event}</div>
        <div className="text-xs text-gray-400">{date}</div>
      </div>
    </div>
  );
}

export function AccountDetailModal({ account, isOpen, onClose }: AccountDetailModalProps) {
  if (!isOpen || !account) return null;

  const daysActive = getDaysActive(account.createdAt);
  const healthInfo = account.trendAnalysis ? getHealthLabel(account.trendAnalysis.health) : null;
  
  // Calculate open rate (mock - would come from API)
  const openRate = account.totalSent > 0 ? Math.min(((account.totalReplies / account.totalSent) * 100 * 3.5), 85) : 0;
  
  // Connection status
  const isConnected = account.status !== 'disconnected';

  // Generate activity timeline
  const activityItems = [
    { 
      date: formatRelativeTime(account.createdAt), 
      event: "Account created", 
      icon: "🎂" 
    },
  ];
  
  if (daysActive > 7 && account.totalSent > 0) {
    activityItems.push({
      date: `Day ${Math.min(daysActive, 30)}`,
      event: `Sent ${account.totalSent.toLocaleString()} emails total`,
      icon: "📤"
    });
  }
  
  if (account.totalReplies > 0) {
    activityItems.push({
      date: "Recent",
      event: `Received ${account.totalReplies.toLocaleString()} replies`,
      icon: "💬"
    });
  }

  if (account.trendAnalysis?.health === 'declining') {
    activityItems.push({
      date: "This week",
      event: `Reply rate dropped ${Math.abs(account.trendAnalysis.percentChange)}% from baseline`,
      icon: "📉"
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 lg:bg-black/30"
        onClick={onClose}
      />
      
      {/* Modal/Panel */}
      <div className="fixed inset-0 z-50 lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[500px] bg-white shadow-2xl overflow-y-auto transition-transform duration-300">
        {/* Header - Sticky */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-lg font-semibold truncate">Account Details</span>
          </div>
          
          {/* Connection status badge */}
          <Badge variant="outline" className={`text-xs ${
            isConnected ? 'border-green-200 text-green-700 bg-green-50' : 'border-red-200 text-red-700 bg-red-50'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 pb-8">
          {/* Account Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">{account.email}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                  <span>{account.name}</span>
                  <span>•</span>
                  <span>{account.domain}</span>
                </div>
              </div>
              {healthInfo && (
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-2xl">{healthInfo.emoji}</span>
                  <span className={`text-xs font-medium ${healthInfo.color}`}>{healthInfo.label}</span>
                </div>
              )}
            </div>
            
            {/* Quick badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                🗓️ {daysActive} days active
              </Badge>
              <Badge variant="outline" className={`text-xs ${
                account.warmupEnabled ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200'
              }`}>
                {account.warmupEnabled ? '🔥 Warmup ON' : '⏸️ Warmup OFF'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                📊 {account.dailyLimit}/day limit
              </Badge>
            </div>
          </div>

          {/* Reply Stats Section */}
          <Card>
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                💬 Reply Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard 
                  icon="📤" 
                  label="Emails Sent" 
                  value={account.totalSent.toLocaleString()}
                  subValue="all time"
                  color="blue"
                />
                <StatCard 
                  icon="💬" 
                  label="Replies" 
                  value={account.totalReplies.toLocaleString()}
                  subValue="total received"
                  color="green"
                />
                <StatCard 
                  icon="📈" 
                  label="Reply Rate" 
                  value={`${account.replyRate}%`}
                  subValue={account.replyRate >= 2 ? "Healthy" : account.replyRate >= 1 ? "Warning" : "Critical"}
                  color={account.replyRate >= 2 ? "green" : account.replyRate >= 1 ? "yellow" : "red"}
                />
                <StatCard 
                  icon="👀" 
                  label="Est. Open Rate" 
                  value={`${openRate.toFixed(1)}%`}
                  subValue="estimated"
                  color="purple"
                />
              </div>
              
              {/* Additional stats row */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                <div className="text-center">
                  <div className="text-xs text-gray-500">📨 Last 7 Days</div>
                  <div className="font-semibold text-sm">{account.sentLast7Days} sent</div>
                </div>
                <div className="text-center border-x">
                  <div className="text-xs text-gray-500">💬 7-Day Replies</div>
                  <div className="font-semibold text-sm">{account.repliesLast7Days}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">📊 7-Day Rate</div>
                  <div className="font-semibold text-sm">
                    {account.sentLast7Days > 0 
                      ? ((account.repliesLast7Days / account.sentLast7Days) * 100).toFixed(1) 
                      : "0"}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warmup Stats Section */}
          <Card>
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                🔥 Warmup Status
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard 
                  icon={account.warmupEnabled ? "✅" : "⏸️"}
                  label="Warmup" 
                  value={account.warmupEnabled ? "ON" : "OFF"}
                  color={account.warmupEnabled ? "green" : "gray"}
                />
                <StatCard 
                  icon="📊" 
                  label="Daily Limit" 
                  value={`${account.dailyLimit}/day`}
                  subValue={account.currentVolume ? `${account.currentVolume} sent today` : undefined}
                  color="blue"
                />
              </div>
              
              {/* Warmup progress */}
              <div className="pt-2">
                <div className="text-xs text-gray-500 mb-2">Warmup Progress</div>
                <WarmupProgressBar dailyLimit={account.dailyLimit} warmupEnabled={account.warmupEnabled} />
              </div>
              
              {/* Warmup stage info */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Stage</div>
                  <div className="font-medium text-sm">
                    {account.dailyLimit <= 10 ? '🔴 Starting' : 
                     account.dailyLimit <= 20 ? '🟠 Growing' : 
                     account.dailyLimit <= 35 ? '🟡 Maturing' : '🟢 Ready'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Days Warming</div>
                  <div className="font-medium text-sm">{Math.min(daysActive, 30)} days</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trend Section */}
          <Card>
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">📉 Reply Rate Trend</span>
                {account.trendAnalysis && account.trendAnalysis.health !== 'gathering-data' && (
                  <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                    account.trendAnalysis.percentChange > 0 ? 'bg-green-100 text-green-700' :
                    account.trendAnalysis.percentChange < 0 ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {account.trendAnalysis.percentChange > 0 ? '↑' : account.trendAnalysis.percentChange < 0 ? '↓' : '→'}
                    {' '}{Math.abs(account.trendAnalysis.percentChange)}% from baseline
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {/* Trend comparison */}
              {account.trendAnalysis && account.trendAnalysis.health !== 'gathering-data' && (
                <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Baseline (14d)</div>
                    <div className="font-bold text-gray-700">{account.trendAnalysis.baselineAvg}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Current (7d)</div>
                    <div className={`font-bold ${
                      account.trendAnalysis.currentAvg > account.trendAnalysis.baselineAvg ? 'text-green-600' : 
                      account.trendAnalysis.currentAvg < account.trendAnalysis.baselineAvg ? 'text-red-600' : 
                      'text-gray-700'
                    }`}>
                      {account.trendAnalysis.currentAvg}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Change</div>
                    <div className={`font-bold ${
                      account.trendAnalysis.percentChange > 0 ? 'text-green-600' : 
                      account.trendAnalysis.percentChange < 0 ? 'text-red-600' : 
                      'text-gray-700'
                    }`}>
                      {account.trendAnalysis.percentChange > 0 ? '+' : ''}{account.trendAnalysis.percentChange}%
                    </div>
                  </div>
                </div>
              )}
              
              {/* Chart */}
              <TrendChart 
                data={account.trendAnalysis?.replyRates || []} 
                baselineAvg={account.trendAnalysis?.baselineAvg || 0}
              />
              
              {/* Trend indicator legend */}
              <div className="flex justify-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Improving
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Stable
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Declining
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-2 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                📅 Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="pt-2">
                {activityItems.map((item, idx) => (
                  <TimelineItem 
                    key={idx}
                    date={item.date}
                    event={item.event}
                    icon={item.icon}
                  />
                ))}
                
                {/* Created date */}
                <div className="flex items-start gap-3 pl-4 ml-2">
                  <div className="absolute -left-[9px] w-4 h-4 rounded-full bg-gray-200"></div>
                  <div className="text-xs text-gray-400">
                    Created on {formatDate(account.createdAt)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Close button for mobile */}
          <button 
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors lg:hidden"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
