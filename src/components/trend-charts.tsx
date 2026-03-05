"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Area,
  ComposedChart,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Types
interface TrendDataPoint {
  date: string;
  avgRate: number;
}

interface AccountTrendData {
  accountId: number;
  email: string;
  replyRates: { date: string; rate: number }[];
  currentAvg: number;
  baselineAvg: number;
  percentChange: number;
  health: string;
}

// Helper to format dates for display
function formatDate(dateStr: string, short = false): string {
  const date = new Date(dateStr);
  if (short) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Calculate trend direction from data points
function calculateTrendDirection(data: { date: string; rate?: number; avgRate?: number }[]): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable';
  
  const values = data.map(d => d.rate ?? d.avgRate ?? 0);
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const change = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;
  
  if (change > 10) return 'up';
  if (change < -10) return 'down';
  return 'stable';
}

// ============================================
// 1. OVERALL REPLY RATE LINE CHART (Top of page)
// ============================================
interface OverallTrendChartProps {
  data: TrendDataPoint[];
  loading?: boolean;
}

export function OverallTrendChart({ data, loading }: OverallTrendChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Ensure data is sorted by date
    return [...data]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        displayDate: formatDate(d.date),
        avgRate: d.avgRate,
      }));
  }, [data]);

  const stats = useMemo(() => {
    if (chartData.length < 2) return null;
    
    const values = chartData.map(d => d.avgRate);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const trend = calculateTrendDirection(chartData);
    const latest = values[values.length - 1];
    const first = values[0];
    const change = latest - first;
    
    return { avg, trend, latest, change };
  }, [chartData]);

  if (loading || chartData.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            📈 Overall Reply Rate Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 lg:h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <span className="text-4xl block mb-2">📊</span>
              <span>Gathering data... Check back tomorrow for trends.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const trendColor = stats?.trend === 'up' ? '#22c55e' : stats?.trend === 'down' ? '#ef4444' : '#6b7280';
  const gradientId = 'overallTrendGradient';

  return (
    <Card className="mb-6 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            📈 Overall Reply Rate Trend
            <span className={`text-sm font-normal ${
              stats?.trend === 'up' ? 'text-green-600' : 
              stats?.trend === 'down' ? 'text-red-600' : 
              'text-gray-500'
            }`}>
              {stats?.trend === 'up' ? '↑ Improving' : stats?.trend === 'down' ? '↓ Declining' : '→ Stable'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-gray-500">
              Avg: <span className="font-bold text-gray-700">{stats?.avg.toFixed(2)}%</span>
            </div>
            <div className={`${(stats?.change ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {(stats?.change ?? 0) >= 0 ? '+' : ''}{stats?.change.toFixed(2)}% over {chartData.length}d
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 lg:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis 
                dataKey="displayDate" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6b7280' }}
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
              {/* Reference line for average */}
              <ReferenceLine 
                y={stats?.avg} 
                stroke="#9ca3af" 
                strokeDasharray="5 5" 
                label={{ 
                  value: `Avg: ${stats?.avg.toFixed(1)}%`, 
                  position: 'right',
                  fontSize: 10,
                  fill: '#9ca3af'
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="avgRate" 
                fill={`url(#${gradientId})`}
                stroke="none"
              />
              <Line 
                type="monotone" 
                dataKey="avgRate" 
                stroke={trendColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 6, stroke: trendColor, strokeWidth: 2, fill: 'white' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// 2. SPARKLINE - Mini inline chart per account
// ============================================
interface SparklineProps {
  data: { date: string; rate: number }[];
  width?: number;
  height?: number;
  showDot?: boolean;
}

export function Sparkline({ data, width = 70, height = 24, showDot = true }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center">
        <span className="text-xs text-gray-400">—</span>
      </div>
    );
  }

  const trend = calculateTrendDirection(data);
  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280';
  
  // Sort and take last 30 points
  const chartData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line 
            type="monotone" 
            dataKey="rate" 
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {showDot && (
            <Line 
              type="monotone" 
              dataKey="rate" 
              stroke="none"
              dot={(props) => {
                const { cx, cy, index } = props;
                if (index === chartData.length - 1) {
                  return (
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={3} 
                      fill={color}
                    />
                  );
                }
                return null;
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================
// 3. EXPANDED ACCOUNT CHART - Full detail view
// ============================================
interface ExpandedAccountChartProps {
  accountData: AccountTrendData;
  onClose?: () => void;
}

export function ExpandedAccountChart({ accountData, onClose }: ExpandedAccountChartProps) {
  const chartData = useMemo(() => {
    if (!accountData.replyRates || accountData.replyRates.length === 0) return [];
    
    return [...accountData.replyRates]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        displayDate: formatDate(d.date),
        rate: d.rate,
      }));
  }, [accountData.replyRates]);

  const trend = calculateTrendDirection(chartData);
  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#3b82f6';
  const bgColor = trend === 'up' ? 'from-green-50 to-white' : trend === 'down' ? 'from-red-50 to-white' : 'from-blue-50 to-white';

  if (chartData.length === 0) {
    return (
      <Card className={`bg-gradient-to-b ${bgColor} border-2`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base truncate flex-1 mr-4">
              📊 {accountData.email}
            </CardTitle>
            {onClose && (
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400">
            <span>No historical data available yet</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gradient-to-b ${bgColor} border-2 hover:shadow-lg transition-shadow`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate flex items-center gap-2">
              📊 {accountData.email}
              <span className={`text-sm font-normal px-2 py-0.5 rounded-full ${
                trend === 'up' ? 'bg-green-100 text-green-700' :
                trend === 'down' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {trend === 'up' ? '↑ Improving' : trend === 'down' ? '↓ Declining' : '→ Stable'}
              </span>
            </CardTitle>
            <div className="flex gap-4 mt-1 text-sm text-gray-500">
              <span>Baseline: <strong>{accountData.baselineAvg}%</strong></span>
              <span>Current: <strong className={trend === 'down' ? 'text-red-600' : 'text-green-600'}>{accountData.currentAvg}%</strong></span>
              <span>Change: <strong className={accountData.percentChange < 0 ? 'text-red-600' : 'text-green-600'}>
                {accountData.percentChange > 0 ? '+' : ''}{accountData.percentChange}%
              </strong></span>
            </div>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2"
            >
              ×
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 lg:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${accountData.accountId}`} x1="0" y1="0" x2="0" y2="1">
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
              {/* Baseline reference line */}
              <ReferenceLine 
                y={accountData.baselineAvg} 
                stroke="#9ca3af" 
                strokeDasharray="5 5" 
                label={{ 
                  value: `Baseline: ${accountData.baselineAvg}%`, 
                  position: 'right',
                  fontSize: 10,
                  fill: '#9ca3af'
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="rate" 
                fill={`url(#gradient-${accountData.accountId})`}
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
      </CardContent>
    </Card>
  );
}

// ============================================
// 4. MULTI-ACCOUNT COMPARISON CHART
// ============================================
interface MultiAccountChartProps {
  accounts: AccountTrendData[];
  title?: string;
}

// Distinct colors for up to 10 accounts
const ACCOUNT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

export function MultiAccountComparisonChart({ accounts, title = "Top Declining Accounts" }: MultiAccountChartProps) {
  // Build unified timeline from all accounts
  const { chartData, accountLabels } = useMemo(() => {
    if (!accounts || accounts.length === 0) return { chartData: [], accountLabels: [] };
    
    // Get all unique dates
    const allDates = new Set<string>();
    accounts.forEach(acc => {
      acc.replyRates.forEach(r => allDates.add(r.date));
    });
    
    const sortedDates = [...allDates].sort();
    
    // Build data points for each date
    const data = sortedDates.map(date => {
      const point: Record<string, string | number> = { 
        date, 
        displayDate: formatDate(date, true) 
      };
      
      accounts.forEach((acc, idx) => {
        const rateData = acc.replyRates.find(r => r.date === date);
        const key = `account_${idx}`;
        point[key] = rateData?.rate ?? null as unknown as number;
      });
      
      return point;
    });
    
    // Build labels for legend
    const labels = accounts.map((acc, idx) => ({
      key: `account_${idx}`,
      email: acc.email.split('@')[0].slice(0, 12),
      color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
      change: acc.percentChange,
    }));
    
    return { chartData: data, accountLabels: labels };
  }, [accounts]);

  if (chartData.length === 0 || accounts.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            📉 {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 lg:h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <span className="text-4xl block mb-2">✨</span>
              <span>No declining accounts to display</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 hover:shadow-lg transition-shadow border-red-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          📉 {title}
          <span className="text-sm font-normal text-red-500">
            ({accounts.length} account{accounts.length !== 1 ? 's' : ''})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3">
          {accountLabels.map((label) => (
            <div key={label.key} className="flex items-center gap-1.5 text-xs">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: label.color }}
              />
              <span className="text-gray-600">{label.email}</span>
              <span className={`font-medium ${label.change < 0 ? 'text-red-600' : 'text-green-600'}`}>
                ({label.change > 0 ? '+' : ''}{label.change}%)
              </span>
            </div>
          ))}
        </div>
        
        <div className="h-48 lg:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                formatter={(value, name) => {
                  if (value === null || value === undefined) return ['—', String(name)];
                  const label = accountLabels.find(l => l.key === name);
                  return [`${Number(value).toFixed(2)}%`, label?.email || String(name)];
                }}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{ 
                  borderRadius: '8px', 
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              />
              {accountLabels.map((label) => (
                <Line 
                  key={label.key}
                  type="monotone" 
                  dataKey={label.key}
                  stroke={label.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: label.color, strokeWidth: 2, fill: 'white' }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// 5. ACCOUNT TREND SUMMARY BADGES
// ============================================
interface TrendBadgeProps {
  percentChange: number;
  compact?: boolean;
}

export function TrendBadge({ percentChange, compact = false }: TrendBadgeProps) {
  const isUp = percentChange > 10;
  const isDown = percentChange < -10;
  
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-gray-500'
      }`}>
        {isUp ? '↑' : isDown ? '↓' : '→'}
        {Math.abs(percentChange)}%
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      isUp ? 'bg-green-100 text-green-700' : 
      isDown ? 'bg-red-100 text-red-700' : 
      'bg-gray-100 text-gray-600'
    }`}>
      {isUp ? '↑ +' : isDown ? '↓ ' : '→ '}
      {Math.abs(percentChange)}%
    </span>
  );
}

// ============================================
// 6. MOCK DATA GENERATOR for demo
// ============================================
export function generateMockTrendData(days: number = 30): TrendDataPoint[] {
  const data: TrendDataPoint[] = [];
  const today = new Date();
  
  // Base rate with some randomness
  let rate = 2.0 + Math.random() * 1.5;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Add some realistic variation
    rate += (Math.random() - 0.5) * 0.3;
    rate = Math.max(0.5, Math.min(5, rate)); // Clamp between 0.5 and 5
    
    data.push({
      date: date.toISOString().split('T')[0],
      avgRate: Math.round(rate * 100) / 100,
    });
  }
  
  return data;
}

export function generateMockAccountTrend(accountId: number, email: string, trend: 'up' | 'down' | 'stable', days: number = 30): AccountTrendData {
  const replyRates: { date: string; rate: number }[] = [];
  const today = new Date();
  
  // Start rate depends on trend
  let rate = trend === 'down' ? 3.5 : trend === 'up' ? 1.5 : 2.5;
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Trend direction with noise
    const trendFactor = trend === 'down' ? -0.08 : trend === 'up' ? 0.08 : 0;
    rate += trendFactor + (Math.random() - 0.5) * 0.2;
    rate = Math.max(0.3, Math.min(5, rate));
    
    replyRates.push({
      date: date.toISOString().split('T')[0],
      rate: Math.round(rate * 100) / 100,
    });
  }
  
  // Calculate averages
  const recent = replyRates.slice(-7);
  const baseline = replyRates.slice(-21, -7);
  
  const currentAvg = recent.reduce((a, b) => a + b.rate, 0) / recent.length;
  const baselineAvg = baseline.length > 0 ? baseline.reduce((a, b) => a + b.rate, 0) / baseline.length : currentAvg;
  const percentChange = baselineAvg > 0 ? ((currentAvg - baselineAvg) / baselineAvg) * 100 : 0;
  
  return {
    accountId,
    email,
    replyRates,
    currentAvg: Math.round(currentAvg * 100) / 100,
    baselineAvg: Math.round(baselineAvg * 100) / 100,
    percentChange: Math.round(percentChange),
    health: percentChange <= -50 ? 'declining' : percentChange <= -25 ? 'warning' : percentChange >= 25 ? 'improving' : 'stable',
  };
}
