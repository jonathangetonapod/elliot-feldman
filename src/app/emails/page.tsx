"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { getEmails, type WarmupStatus, type SenderEmail } from "@/lib/mock-data";
import { toast } from "sonner";
import {
  fetchWarmupStats,
  getWarmupHealthSummary,
  getPeriodLabel,
  type WarmupAccountComparison,
  type WarmupPeriodType,
} from "@/lib/bison-api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  calculateAccountTrend,
  getDaysActive,
  type AccountTrend,
  type TrendHealth,
} from "@/lib/account-history";
import {
  OverallTrendChart,
  Sparkline as EnhancedSparkline,
  ExpandedAccountChart,
  MultiAccountComparisonChart,
  generateMockTrendData,
  generateMockAccountTrend,
  type DateRange,
  getDateRangeFromPreset,
} from "@/components/trend-charts";
import { AccountDetailModal, type AccountDetailData } from "@/components/account-detail-modal";

interface BisonSenderEmail {
  id: number;
  email: string;
  name: string;
  status: "connected" | "disconnected";
  warmup_enabled: boolean;
  warmup_limit: number;
  daily_limit: number;
  emails_sent_today?: number;
  emails_sent_count?: number;
  total_replied_count?: number;
  unique_replied_count?: number;
  created_at: string;
}

// Transform Bison API data to our SenderEmail format
function transformBisonEmail(bisonEmail: BisonSenderEmail): DisplayEmail {
  const emailParts = bisonEmail.email.split("@");
  const domain = emailParts[1] || "unknown.com";

  // Calculate warmup day based on created_at (30 days warmup period)
  const createdAt = new Date(bisonEmail.created_at);
  const now = new Date();
  const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const warmupDay = Math.min(daysSinceCreation, 30);

  // Determine warmup status based on warmup_enabled and daily_limit
  let warmupStatus: WarmupStatus;
  if (!bisonEmail.warmup_enabled) {
    warmupStatus = "paused";
  } else if (bisonEmail.daily_limit >= 40) {
    warmupStatus = "ready";
  } else {
    warmupStatus = "warming";
  }

  // Calculate warmup ready date
  const warmupReadyDate = new Date(createdAt);
  warmupReadyDate.setDate(warmupReadyDate.getDate() + 30);

  // Calculate reply rate from real data
  const emailsSent = bisonEmail.emails_sent_count || 0;
  const uniqueReplies = bisonEmail.unique_replied_count || bisonEmail.total_replied_count || 0;

  let replyRate: number;
  if (emailsSent > 0) {
    replyRate = (uniqueReplies / emailsSent) * 100;
  } else {
    // No emails sent yet - neutral status
    replyRate = 0;
  }

  return {
    id: bisonEmail.id,
    email: bisonEmail.email,
    name: bisonEmail.name || bisonEmail.email.split("@")[0],
    domain,
    status: "healthy", // Will be overwritten by trend analysis
    warmupStatus,
    warmupDay,
    warmupReadyDate: warmupReadyDate.toISOString().split("T")[0],
    dailyLimit: bisonEmail.daily_limit ?? 50,
    currentVolume: bisonEmail.emails_sent_today ?? 0,
    replyRate: Math.round(replyRate * 100) / 100,
    avgReplyRate: 2.2,
    sentLast7Days: emailsSent,
    repliesLast7Days: uniqueReplies,
    lastSyncedAt: new Date().toISOString(),
    // Store additional fields for display
    warmupEnabled: bisonEmail.warmup_enabled,
    totalSent: emailsSent,
    totalReplies: uniqueReplies,
    createdAt: bisonEmail.created_at,
    daysActive: daysSinceCreation,
  };
}

// Extended type for display
type DisplayEmail = SenderEmail & {
  warmupEnabled?: boolean;
  totalSent?: number;
  totalReplies?: number;
  createdAt?: string;
  daysActive?: number;
  trend?: AccountTrend | null;
};

// Health classification based on warmup score changes from Bison API
// No more "gathering-data" - we have real historical data from Bison!
function getHealthFromWarmup(warmup: WarmupAccountComparison | undefined): TrendHealth {
  if (!warmup) return 'stable'; // Default to stable if no data
  return warmup.health === 'new' ? 'stable' : warmup.health;
}

// Get health classification label and emoji
function getHealthLabel(health: TrendHealth): { emoji: string; label: string; color: string } {
  switch (health) {
    case 'declining':
      return { emoji: '🔴', label: 'Declining', color: 'text-red-600' };
    case 'warning':
      return { emoji: '🟡', label: 'Warning', color: 'text-yellow-600' };
    case 'stable':
      return { emoji: '🟢', label: 'Stable', color: 'text-green-600' };
    case 'improving':
      return { emoji: '📈', label: 'Improving', color: 'text-blue-600' };
    default:
      return { emoji: '🟢', label: 'Stable', color: 'text-green-600' };
  }
}

// ==========================================
// 🔥 BURN RISK PREDICTION SYSTEM (REPLY RATE BASED)
// ==========================================

interface BurnRiskResult {
  score: number;  // 0-100, higher = more likely to burn
  level: 'critical' | 'high' | 'moderate' | 'low';
  emoji: string;  // 🔥🔥🔥, 🔥🔥, 🔥, or ✅
  reasons: string[];
  replyRateChange: number | null;
  currentReplyRate: number | null;
  baselineReplyRate: number | null;
}

// Calculate burn risk for an account based on REPLY RATE changes (NOT bounces!)
// Burn Risk = Reply Rate dropping drastically week over week
function calculateBurnRisk(warmup: WarmupAccountComparison | undefined): BurnRiskResult {
  if (!warmup) {
    return { score: 0, level: 'low', emoji: '✅', reasons: [], replyRateChange: null, currentReplyRate: null, baselineReplyRate: null };
  }

  let riskScore = 0;
  const reasons: string[] = [];

  // REPLY RATE is the key metric for burn prediction!
  const currentReplyRate = warmup.current.warmup_reply_rate ?? 0;
  const baselineReplyRate = warmup.baseline?.warmup_reply_rate ?? 0;
  const replyRateChange = warmup.changes.warmup_reply_rate ?? 0;

  // Risk factor 1: Reply rate dropped >50% - CRITICAL (+50)
  // 🔥🔥🔥 Critical: Reply rate dropped >50% week over week
  if (replyRateChange <= -50) {
    riskScore += 50;
    reasons.push(`Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
    reasons.push(`This account's reply rate dropped drastically`);
  }
  // Risk factor 2: Reply rate dropped 30-50% - HIGH (+35)
  // 🔥🔥 High: Reply rate dropped 30-50% week over week
  else if (replyRateChange <= -30) {
    riskScore += 35;
    reasons.push(`Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
    reasons.push(`Reply rate declining significantly`);
  }
  // Risk factor 3: Reply rate dropped 20-30% - MODERATE (+20)
  // 🔥 Moderate: Reply rate dropped 20-30% week over week  
  else if (replyRateChange <= -20) {
    riskScore += 20;
    reasons.push(`Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
  }

  // Additional risk: Very low current reply rate (+20 if <1%)
  if (currentReplyRate < 1 && warmup.current.warmup_emails_sent > 10) {
    riskScore += 20;
    reasons.push(`Current reply rate critically low (${currentReplyRate.toFixed(1)}%)`);
  }

  // Additional: Bounces increasing is a secondary indicator (+10)
  const bouncesChange = warmup.changes.warmup_bounces_received_count;
  if (bouncesChange > 3) {
    riskScore += 10;
    reasons.push(`Bounces also increasing (+${bouncesChange})`);
  }

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  // Determine level and emoji based on reply rate drop severity
  let level: 'critical' | 'high' | 'moderate' | 'low';
  let emoji: string;
  
  // 🔥🔥🔥 Critical: Reply rate dropped >50% week over week
  if (riskScore >= 50 || replyRateChange <= -50) {
    level = 'critical';
    emoji = '🔥🔥🔥';
  } 
  // 🔥🔥 High: Reply rate dropped 30-50% week over week
  else if (riskScore >= 35 || replyRateChange <= -30) {
    level = 'high';
    emoji = '🔥🔥';
  } 
  // 🔥 Moderate: Reply rate dropped 20-30% week over week
  else if (riskScore >= 20 || replyRateChange <= -20) {
    level = 'moderate';
    emoji = '🔥';
  } else {
    level = 'low';
    emoji = '✅';
  }

  return { 
    score: riskScore, 
    level, 
    emoji, 
    reasons,
    replyRateChange,
    currentReplyRate,
    baselineReplyRate,
  };
}

// Get CSS classes for burn risk level
function getBurnRiskClasses(level: BurnRiskResult['level']): { bg: string; border: string; text: string; badge: string } {
  switch (level) {
    case 'critical':
      return { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800', badge: 'bg-red-600' };
    case 'high':
      return { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', badge: 'bg-orange-600' };
    case 'moderate':
      return { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-800', badge: 'bg-yellow-600' };
    default:
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-600' };
  }
}

// Burn Risk Badge Component
function BurnRiskBadge({ risk, compact = false }: { risk: BurnRiskResult; compact?: boolean }) {
  if (risk.level === 'low') return null;
  
  const classes = getBurnRiskClasses(risk.level);
  
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white ${classes.badge}`}>
        {risk.emoji} {risk.score}
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white ${classes.badge}`}>
      {risk.emoji} {risk.level.toUpperCase()} RISK ({risk.score}/100)
    </span>
  );
}

// Mini Sparkline component for reply rate history
function MiniSparkline({ data, width = 60, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <span className="text-xs text-gray-400">-</span>;
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
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Trend-based health indicator using Bison warmup API data
function TrendHealthIndicator({ warmup }: { warmup: WarmupAccountComparison | undefined }) {
  const health = getHealthFromWarmup(warmup);
  const { emoji, label, color } = getHealthLabel(health);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-lg">{emoji}</span>
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  );
}

// Trend change display using Bison warmup API data (Was X → Now Y)
function TrendChangeDisplay({ warmup, compact = false }: { warmup: WarmupAccountComparison | undefined; compact?: boolean }) {
  if (!warmup) {
    return <span className="text-xs text-gray-400">-</span>;
  }

  const currentScore = warmup.current.warmup_score;
  const baselineScore = warmup.baseline?.warmup_score ?? currentScore;
  const change = warmup.changes.warmup_score;

  const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  const changeColor = change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500';

  if (compact) {
    return (
      <div className="text-xs">
        <span className="text-gray-500">{baselineScore}</span>
        <span className="text-gray-300 mx-1">→</span>
        <span className={changeColor}>{currentScore}</span>
        {Math.abs(change) >= 1 && (
          <span className={`ml-1 ${changeColor}`}>
            ({changeIcon}{Math.abs(Math.round(change))}%)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div className="text-gray-500 mb-1">
        Was <span className="font-medium">{baselineScore}</span> score
      </div>
      <div className={changeColor}>
        Now <span className="font-medium">{currentScore}</span> = {changeIcon}{Math.abs(Math.round(change))}%
      </div>
    </div>
  );
}

// Visual Reply Rate Bar Component
function ReplyRateBar({ rate, hasSends }: { rate: number; hasSends: boolean }) {
  if (!hasSends) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gray-300 w-0" />
        </div>
        <span className="text-gray-400 text-sm">-</span>
      </div>
    );
  }

  const percentage = Math.min(rate * 20, 100); // Scale: 5% = 100% bar width
  // Use neutral colors - health is now shown separately via trend analysis
  const color = "bg-blue-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700">
        {rate}%
      </span>
    </div>
  );
}

// Warmup Stage Indicator Component
function WarmupStageIndicator({ dailyLimit, warmupEnabled }: { dailyLimit: number; warmupEnabled: boolean }) {
  // Stages: 🔴 (5-10) → 🟠 (11-20) → 🟡 (21-35) → 🟢 (36-50)
  const getStage = () => {
    if (!warmupEnabled) return { emoji: "⏸️", label: "Paused", color: "text-gray-400", bgColor: "bg-gray-100" };
    if (dailyLimit <= 10) return { emoji: "🔴", label: "Starting", color: "text-red-600", bgColor: "bg-red-100" };
    if (dailyLimit <= 20) return { emoji: "🟠", label: "Growing", color: "text-orange-600", bgColor: "bg-orange-100" };
    if (dailyLimit <= 35) return { emoji: "🟡", label: "Maturing", color: "text-yellow-600", bgColor: "bg-yellow-100" };
    return { emoji: "🟢", label: "Ready", color: "text-green-600", bgColor: "bg-green-100" };
  };

  const stage = getStage();

  // Progress visualization
  const stages = [
    { min: 5, max: 10, emoji: "🔴" },
    { min: 11, max: 20, emoji: "🟠" },
    { min: 21, max: 35, emoji: "🟡" },
    { min: 36, max: 50, emoji: "🟢" },
  ];

  const currentStageIndex = dailyLimit <= 10 ? 0 : dailyLimit <= 20 ? 1 : dailyLimit <= 35 ? 2 : 3;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Stage dots */}
      <div className="flex items-center gap-0.5">
        {stages.map((s, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full transition-all ${
              idx <= currentStageIndex && warmupEnabled
                ? idx === 0 ? "bg-red-500" : idx === 1 ? "bg-orange-500" : idx === 2 ? "bg-yellow-500" : "bg-green-500"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      {/* Label */}
      <span className={`text-xs ${stage.color}`}>
        {stage.emoji} {dailyLimit}/day
      </span>
    </div>
  );
}

// Warmup Score Bar Component
function WarmupScoreBar({ score, baseline, change }: { score: number; baseline?: number; change?: number }) {
  // Score is 0-100
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getChangeIcon = () => {
    if (!change || Math.abs(change) < 5) return { icon: '→', color: 'text-gray-500' };
    if (change > 0) return { icon: '↑', color: 'text-green-600' };
    return { icon: '↓', color: 'text-red-600' };
  };

  const { icon, color } = getChangeIcon();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getScoreColor(score)} rounded-full transition-all duration-300`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-sm font-medium">{score}</span>
        {change !== undefined && Math.abs(change) >= 1 && (
          <span className={`text-xs ${color}`}>
            {icon}{Math.abs(Math.round(change))}%
          </span>
        )}
      </div>
      {baseline !== undefined && (
        <div className="text-xs text-gray-400">
          was {baseline}
        </div>
      )}
    </div>
  );
}

// Warmup Stats Card for Account
function WarmupStatsCard({ warmup }: { warmup: WarmupAccountComparison | undefined }) {
  if (!warmup) {
    return (
      <div className="bg-gray-50 rounded-lg p-3 border text-center">
        <span className="text-xs text-gray-400">No warmup data</span>
      </div>
    );
  }

  const { current, baseline, changes, health } = warmup;

  const getHealthBadge = () => {
    switch (health) {
      case 'declining': return { emoji: '🔴', label: 'Declining', bg: 'bg-red-100', text: 'text-red-700' };
      case 'warning': return { emoji: '🟡', label: 'Warning', bg: 'bg-yellow-100', text: 'text-yellow-700' };
      case 'stable': return { emoji: '🟢', label: 'Stable', bg: 'bg-green-100', text: 'text-green-700' };
      case 'improving': return { emoji: '📈', label: 'Improving', bg: 'bg-blue-100', text: 'text-blue-700' };
      case 'new': return { emoji: '🆕', label: 'New', bg: 'bg-gray-100', text: 'text-gray-700' };
    }
  };

  const healthBadge = getHealthBadge();

  return (
    <div className="bg-white rounded-lg p-3 border space-y-3">
      {/* Health Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">🔥 Warmup Health</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${healthBadge.bg} ${healthBadge.text}`}>
          {healthBadge.emoji} {healthBadge.label}
        </span>
      </div>

      {/* Warmup Score */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Score</div>
        <WarmupScoreBar 
          score={current.warmup_score} 
          baseline={baseline?.warmup_score}
          change={changes.warmup_score}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <div className="text-gray-500">📤 Sent</div>
          <div className="font-medium">{current.warmup_emails_sent}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">💬 Replies</div>
          <div className="font-medium">{current.warmup_replies_received}</div>
          {changes.warmup_replies_received !== 0 && (
            <div className={`text-xs ${changes.warmup_replies_received > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {changes.warmup_replies_received > 0 ? '↑' : '↓'}{Math.abs(Math.round(changes.warmup_replies_received))}%
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-gray-500">🚫 Bounces</div>
          <div className={`font-medium ${current.warmup_bounces_received_count > 0 ? 'text-red-600' : ''}`}>
            {current.warmup_bounces_received_count}
          </div>
          {changes.warmup_bounces_received_count > 0 && (
            <div className="text-xs text-red-600">+{changes.warmup_bounces_received_count}</div>
          )}
        </div>
      </div>

      {/* Spam saved */}
      {current.warmup_emails_saved_from_spam > 0 && (
        <div className="text-xs text-green-600 text-center">
          ✅ {current.warmup_emails_saved_from_spam} saved from spam
        </div>
      )}
    </div>
  );
}

// Mini Pie Chart for Account Health - Using Bison warmup API data
function MiniHealthPie({ stats }: { stats: { declining: number; warning: number; stable: number; improving: number; newAccounts: number } }) {
  const data = [
    { name: "Stable", value: stats.stable, color: "#22c55e" },
    { name: "Improving", value: stats.improving, color: "#3b82f6" },
    { name: "Warning", value: stats.warning, color: "#eab308" },
    { name: "Declining", value: stats.declining, color: "#ef4444" },
    { name: "New", value: stats.newAccounts, color: "#9ca3af" },
  ].filter(d => d.value > 0);

  return (
    <div className="w-16 h-16">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={12}
            outerRadius={28}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value}`, '']} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Trend Distribution Pie Chart (larger version) - Using Bison warmup API data
function TrendDistributionChart({ stats }: { stats: { declining: number; warning: number; stable: number; improving: number; newAccounts: number } }) {
  const data = [
    { name: "Stable", value: stats.stable, color: "#22c55e" },
    { name: "Improving", value: stats.improving, color: "#3b82f6" },
    { name: "Warning", value: stats.warning, color: "#eab308" },
    { name: "Declining", value: stats.declining, color: "#ef4444" },
    { name: "New", value: stats.newAccounts, color: "#9ca3af" },
  ].filter(d => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={55}
              dataKey="value"
              strokeWidth={2}
              stroke="#fff"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [`${value} (${Math.round((value as number) / total * 100)}%)`, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
            <span className="text-gray-600">{item.name}:</span>
            <span className="font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from URL params
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [healthFilter, setHealthFilter] = useState<TrendHealth | "all">(
    (searchParams.get("health") as TrendHealth | "all") || "all"
  );
  const [warmupFilter, setWarmupFilter] = useState<"on" | "off" | "all">(
    (searchParams.get("warmup") as "on" | "off" | "all") || "all"
  );
  const [sortBy, setSortBy] = useState<"replyRate" | "dailyLimit" | "totalSent">(
    (searchParams.get("sort") as "replyRate" | "dailyLimit" | "totalSent") || "replyRate"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    (searchParams.get("order") as "asc" | "desc") || "asc"
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [apiEmails, setApiEmails] = useState<DisplayEmail[] | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // NOTE: Trends are now derived from warmup API data (warmupStatsMap)
  // No more localStorage-based history tracking needed!

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Charts visibility toggle
  const [showCharts, setShowCharts] = useState(true);
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  
  // Account detail modal state
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<AccountDetailData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Warmup stats state
  const [warmupStatsMap, setWarmupStatsMap] = useState<Map<string, WarmupAccountComparison>>(new Map());
  const [warmupPeriod, setWarmupPeriod] = useState<WarmupPeriodType>('7vs14');
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [warmupSummary, setWarmupSummary] = useState<ReturnType<typeof getWarmupHealthSummary> | null>(null);
  
  // Simple time period state for historical comparison
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<7 | 14 | 30>(7);
  
  // Date range state for trend charts
  const [trendDateRange, setTrendDateRange] = useState<DateRange>(() => getDateRangeFromPreset("7d"));

  const pageSize = 25;

  // Update URL when filters change
  const updateURL = useCallback((
    newHealth: TrendHealth | "all",
    newWarmup: "on" | "off" | "all",
    newSearch: string,
    newSort: string,
    newOrder: string
  ) => {
    const params = new URLSearchParams();
    if (newHealth !== "all") params.set("health", newHealth);
    if (newWarmup !== "all") params.set("warmup", newWarmup);
    if (newSearch) params.set("search", newSearch);
    if (newSort !== "replyRate") params.set("sort", newSort);
    if (newOrder !== "asc") params.set("order", newOrder);
    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : "/emails", { scroll: false });
  }, [router]);

  // Fetch emails from Bison API
  useEffect(() => {
    async function fetchEmails() {
      setLoading(true);

      try {
        const response = await fetch("/api/bison?endpoint=sender-emails");

        if (!response.ok) {
          console.warn("Bison API unavailable, falling back to mock data");
          setUsingMockData(true);
          setApiEmails(null);
          return;
        }

        const data = await response.json();

        if (data.error) {
          console.warn("Bison API error:", data.error);
          setUsingMockData(true);
          setApiEmails(null);
          return;
        }

        // Handle both array response and paginated response
        const emails = Array.isArray(data) ? data : (data.data || data.items || []);

        if (emails.length === 0) {
          console.warn("No emails from Bison API, falling back to mock data");
          setUsingMockData(true);
          setApiEmails(null);
          return;
        }

        const transformedEmails = emails.map(transformBisonEmail);
        setApiEmails(transformedEmails);
        setUsingMockData(false);
      } catch (error) {
        console.error("Failed to fetch from Bison API:", error);
        setUsingMockData(true);
        setApiEmails(null);
      } finally {
        setLoading(false);
      }
    }

    fetchEmails();
  }, []);

  // Fetch warmup stats with date range comparison from Bison API
  // This is our source of truth for historical trends!
  useEffect(() => {
    async function fetchWarmup() {
      setWarmupLoading(true);
      try {
        // Map selectedTimePeriod to warmup period type
        // e.g., 7 days = compare last 7 vs previous 7
        const periodMap: Record<7 | 14 | 30, WarmupPeriodType> = {
          7: '7vs7',
          14: '14vs14',
          30: '30vs30',
        };
        const response = await fetchWarmupStats(periodMap[selectedTimePeriod], true);
        
        if (response.data) {
          // Create map for quick lookup by email
          const statsMap = new Map<string, WarmupAccountComparison>();
          for (const account of response.data) {
            statsMap.set(account.email.toLowerCase(), account);
          }
          setWarmupStatsMap(statsMap);
          
          // Calculate summary
          const summary = getWarmupHealthSummary(response.data);
          setWarmupSummary(summary);
        }
      } catch (error) {
        console.error('Failed to fetch warmup stats:', error);
        // Non-blocking - warmup stats are supplementary
      } finally {
        setWarmupLoading(false);
      }
    }
    
    fetchWarmup();
  }, [selectedTimePeriod]);

  // NOTE: We no longer need localStorage-based history tracking!
  // All trend data comes from the Bison warmup API which has real historical data

  // 🔥 Calculate BURN RISK for all accounts
  const burnRiskData = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    
    const accountsWithRisk = allEmails.map(email => {
      const warmup = warmupStatsMap.get(email.email.toLowerCase());
      const risk = calculateBurnRisk(warmup);
      return {
        email,
        warmup,
        risk,
      };
    });
    
    // Filter to at-risk accounts (score >= 30)
    const atRisk = accountsWithRisk
      .filter(a => a.risk.score >= 30)
      .sort((a, b) => b.risk.score - a.risk.score); // Sort by highest risk first
    
    // Count by level
    const critical = atRisk.filter(a => a.risk.level === 'critical').length;
    const high = atRisk.filter(a => a.risk.level === 'high').length;
    const moderate = atRisk.filter(a => a.risk.level === 'moderate').length;
    
    return {
      allWithRisk: accountsWithRisk,
      atRisk,
      critical,
      high,
      moderate,
      total: atRisk.length,
    };
  }, [apiEmails, warmupStatsMap]);

  // Calculate dropped accounts for selected time period
  // Calculate dropped accounts based on REPLY RATE changes (not warmup score!)
  // Burn Risk = Reply Rate dropping drastically week over week
  const droppedAccountsData = useMemo(() => {
    const allAccounts = Array.from(warmupStatsMap.values());
    
    // Filter accounts with baseline data (can compare)
    const comparableAccounts = allAccounts.filter(a => a.baseline !== null && a.baseline.warmup_reply_rate !== undefined);
    
    // Calculate percent change in REPLY RATE (not warmup score!)
    const withChanges = comparableAccounts.map(account => {
      const change = account.changes.warmup_reply_rate ?? 0;
      const fromRate = account.baseline?.warmup_reply_rate ?? 0;
      const toRate = account.current.warmup_reply_rate ?? 0;
      return {
        ...account,
        fromScore: fromRate,  // Using "fromScore" for compatibility but it's actually reply rate
        toScore: toRate,      // Using "toScore" for compatibility but it's actually reply rate
        percentChange: change,
      };
    });
    
    // 🔥🔥🔥 Critical: Reply rate dropped >50% week over week
    const critical = withChanges
      .filter(a => a.percentChange < -50)
      .sort((a, b) => a.percentChange - b.percentChange); // Most dropped first
    
    // 🔥🔥 High: Reply rate dropped 30-50% week over week (LIKELY TO BURN!)
    const dropped = withChanges
      .filter(a => a.percentChange < -30)
      .sort((a, b) => a.percentChange - b.percentChange); // Most dropped first
    
    // 🔥 Moderate: Reply rate dropped 20-30% week over week
    const warning = withChanges.filter(a => a.percentChange >= -30 && a.percentChange < -20);
    
    // Stable (within ±20%)
    const stable = withChanges.filter(a => a.percentChange >= -20 && a.percentChange <= 20);
    
    // Improved (>20% up)
    const improved = withChanges
      .filter(a => a.percentChange > 20)
      .sort((a, b) => b.percentChange - a.percentChange); // Most improved first
    
    // Calculate average change
    const avgChange = withChanges.length > 0
      ? Math.round(withChanges.reduce((sum, a) => sum + a.percentChange, 0) / withChanges.length * 10) / 10
      : 0;
    
    return {
      critical,  // NEW: Critical risk accounts (>50% drop)
      dropped,   // Likely to burn (>30% drop)
      warning,   // Moderate risk (20-30% drop)
      stable,
      improved,
      total: comparableAccounts.length,
      newAccounts: allAccounts.length - comparableAccounts.length,
      avgChange,
    };
  }, [warmupStatsMap]);

  // Calculate stats for the summary bar - using Bison warmup API data
  const summaryStats = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;

    const warmupOn = allEmails.filter(e => (e as DisplayEmail).warmupEnabled !== false && e.warmupStatus !== "paused").length;
    const warmupOff = allEmails.filter(e => (e as DisplayEmail).warmupEnabled === false || e.warmupStatus === "paused").length;

    // Calculate average reply rate (only for accounts with sends)
    const emailsWithSends = allEmails.filter(e => e.sentLast7Days > 0 || (e as DisplayEmail).totalSent && (e as DisplayEmail).totalSent! > 0);
    const avgReplyRate = emailsWithSends.length > 0
      ? emailsWithSends.reduce((sum, e) => sum + e.replyRate, 0) / emailsWithSends.length
      : 0;

    // Count by health status from Bison warmup API data
    let declining = 0;
    let warning = 0;
    let stable = 0;
    let improving = 0;
    let newAccounts = 0;

    for (const email of allEmails) {
      const warmup = warmupStatsMap.get(email.email.toLowerCase());
      const health = getHealthFromWarmup(warmup);
      
      if (!warmup || warmup.health === 'new') {
        newAccounts++;
      } else {
        switch (health) {
          case 'declining': declining++; break;
          case 'warning': warning++; break;
          case 'stable': stable++; break;
          case 'improving': improving++; break;
        }
      }
    }

    return {
      total: allEmails.length,
      warmupOn,
      warmupOff,
      avgReplyRate: Math.round(avgReplyRate * 100) / 100,
      declining,
      warning,
      stable,
      improving,
      newAccounts,
    };
  }, [apiEmails, warmupStatsMap]);

  // Get expanded account data for detail view - using Bison warmup API data
  const expandedAccountData = useMemo(() => {
    if (!expandedAccountId) return null;
    
    const email = apiEmails?.find(e => e.id === expandedAccountId) || 
                  getEmails({ page: 1, pageSize: 10000 }).data.find(e => e.id === expandedAccountId);
    
    if (!email) return null;
    
    const warmup = warmupStatsMap.get(email.email.toLowerCase());
    
    if (warmup) {
      const health = getHealthFromWarmup(warmup);
      return {
        accountId: expandedAccountId,
        email: email.email,
        replyRates: [], // Would need more API calls to get daily breakdown
        currentAvg: warmup.current.warmup_score,
        baselineAvg: warmup.baseline?.warmup_score ?? warmup.current.warmup_score,
        percentChange: warmup.changes.warmup_score,
        health: health,
      };
    }
    
    // Generate mock data for demo if no warmup data
    const mockTrend = usingMockData ? 
      (email.replyRate < 1 ? 'down' : email.replyRate > 3 ? 'up' : 'stable') as 'up' | 'down' | 'stable' : 
      'stable';
    return generateMockAccountTrend(expandedAccountId, email.email, mockTrend, 30);
  }, [expandedAccountId, warmupStatsMap, apiEmails, usingMockData]);

  // Get top 5 declining accounts for comparison chart - using Bison warmup API data
  const topDecliningAccounts = useMemo(() => {
    const declining: Array<{
      accountId: number;
      email: string;
      replyRates: { date: string; rate: number }[];
      currentAvg: number;
      baselineAvg: number;
      percentChange: number;
      health: string;
    }> = [];
    
    // Get accounts with declining or warning status from warmup API
    warmupStatsMap.forEach((warmup, emailKey) => {
      if (warmup.health === 'declining' || warmup.health === 'warning') {
        declining.push({
          accountId: warmup.id,
          email: warmup.email,
          replyRates: [], // Would need daily breakdown from API
          currentAvg: warmup.current.warmup_score,
          baselineAvg: warmup.baseline?.warmup_score ?? warmup.current.warmup_score,
          percentChange: warmup.changes.warmup_score,
          health: warmup.health,
        });
      }
    });
    
    // If using mock data and no real declining accounts, generate some
    if (usingMockData && declining.length === 0) {
      const mockEmails = ['john@acme.com', 'sarah@startup.io', 'mike@corp.net', 'lisa@tech.co', 'alex@biz.org'];
      return mockEmails.slice(0, 5).map((email, idx) => 
        generateMockAccountTrend(1000 + idx, email, 'down', 30)
      );
    }
    
    // Sort by percent change (most negative first) and take top 5
    return declining
      .sort((a, b) => a.percentChange - b.percentChange)
      .slice(0, 5);
  }, [warmupStatsMap, usingMockData]);

  // Calculate counts for quick filters - using Bison warmup API data
  const filterCounts = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;

    let declining = 0;
    let warning = 0;
    let stable = 0;
    let improving = 0;
    let newAccounts = 0;

    for (const email of allEmails) {
      const warmup = warmupStatsMap.get(email.email.toLowerCase());
      const health = getHealthFromWarmup(warmup);
      
      if (!warmup || warmup.health === 'new') {
        newAccounts++;
      } else {
        switch (health) {
          case 'declining': declining++; break;
          case 'warning': warning++; break;
          case 'stable': stable++; break;
          case 'improving': improving++; break;
        }
      }
    }

    return {
      all: allEmails.length,
      declining,
      warning,
      stable,
      improving,
      newAccounts,
    };
  }, [apiEmails, warmupStatsMap]);

  // Quick filter handlers
  const handleQuickFilter = (type: TrendHealth | "all") => {
    setHealthFilter(type);
    setPage(1);
    updateURL(type, warmupFilter, search, sortBy, sortOrder);
  };

  // Filter and paginate emails
  const { data: emails, total, totalPages, filteredEmails: allFilteredEmails } = useMemo(() => {
    // Use mock data if API data not available
    if (apiEmails === null) {
      const result = getEmails({
        page,
        pageSize,
        search,
        status: healthFilter === "declining" ? "burned" : healthFilter === "warning" ? "warning" : healthFilter === "stable" || healthFilter === "improving" ? "healthy" : "all",
        warmupStatus: warmupFilter === "on" ? "ready" : warmupFilter === "off" ? "paused" : "all",
        sortBy: "replyRate",
        sortOrder: "asc",
      });
      return { ...result, filteredEmails: result.data };
    }

    // Filter API data locally
    let filteredEmails = [...apiEmails] as DisplayEmail[];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredEmails = filteredEmails.filter(
        (e) =>
          e.email.toLowerCase().includes(searchLower) ||
          e.name.toLowerCase().includes(searchLower)
      );
    }

    // Health filter using Bison warmup API data
    if (healthFilter !== "all") {
      filteredEmails = filteredEmails.filter((e) => {
        const warmup = warmupStatsMap.get(e.email.toLowerCase());
        const health = getHealthFromWarmup(warmup);
        return health === healthFilter;
      });
    }

    // Warmup filter (ON/OFF based on warmup_enabled)
    if (warmupFilter === "on") {
      filteredEmails = filteredEmails.filter((e) => e.warmupEnabled !== false && e.warmupStatus !== "paused");
    } else if (warmupFilter === "off") {
      filteredEmails = filteredEmails.filter((e) => e.warmupEnabled === false || e.warmupStatus === "paused");
    }

    // Sort
    filteredEmails.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case "dailyLimit":
          aVal = a.dailyLimit;
          bVal = b.dailyLimit;
          break;
        case "totalSent":
          aVal = a.totalSent || a.sentLast7Days;
          bVal = b.totalSent || b.sentLast7Days;
          break;
        case "replyRate":
        default:
          aVal = a.replyRate;
          bVal = b.replyRate;
          break;
      }
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    const total = filteredEmails.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = filteredEmails.slice(start, start + pageSize);

    return { data, total, page, pageSize, totalPages, filteredEmails };
  }, [apiEmails, page, pageSize, search, healthFilter, warmupFilter, sortBy, sortOrder, warmupStatsMap]);

  // Selection handlers
  const toggleSelectEmail = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    const currentPageIds = emails.map(e => e.id);
    const allSelected = currentPageIds.every(id => selectedIds.has(id));

    if (allSelected) {
      // Deselect all on current page
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all on current page
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        currentPageIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [emails, selectedIds]);

  const selectAllFiltered = useCallback(() => {
    const allIds = allFilteredEmails.map(e => e.id);
    setSelectedIds(new Set(allIds));
  }, [allFilteredEmails]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Check selection state for current page
  const currentPageIds = emails.map(e => e.id);
  const allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const someOnPageSelected = currentPageIds.some(id => selectedIds.has(id));

  // Open account detail modal - uses Bison warmup API data
  const openAccountDetail = useCallback((email: DisplayEmail) => {
    const warmup = warmupStatsMap.get(email.email.toLowerCase());
    
    // Convert warmup data to trendAnalysis format for the modal
    const trendAnalysis = warmup ? {
      accountId: warmup.id,
      email: warmup.email,
      health: getHealthFromWarmup(warmup),
      currentAvg: warmup.current.warmup_score,
      baselineAvg: warmup.baseline?.warmup_score ?? warmup.current.warmup_score,
      percentChange: Math.round(warmup.changes.warmup_score),
      daysOfData: 14, // We have data from Bison
      trend: warmup.changes.warmup_score > 0 ? 'up' as const : warmup.changes.warmup_score < 0 ? 'down' as const : 'flat' as const,
      replyRates: [],
    } : null;
    
    const accountData: AccountDetailData = {
      id: email.id,
      email: email.email,
      name: email.name,
      domain: email.domain,
      status: email.status,
      warmupEnabled: email.warmupEnabled !== false && email.warmupStatus !== "paused",
      warmupStatus: email.warmupStatus,
      warmupDay: email.warmupDay || 0,
      dailyLimit: email.dailyLimit,
      currentVolume: email.currentVolume,
      replyRate: email.replyRate,
      totalSent: email.totalSent || email.sentLast7Days,
      totalReplies: email.totalReplies || email.repliesLast7Days,
      sentLast7Days: email.sentLast7Days,
      repliesLast7Days: email.repliesLast7Days,
      createdAt: email.createdAt || new Date().toISOString(),
      lastSyncedAt: email.lastSyncedAt,
      trendAnalysis: trendAnalysis,
    };
    
    setSelectedAccountForDetail(accountData);
    setIsDetailModalOpen(true);
  }, [warmupStatsMap]);

  const closeAccountDetail = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedAccountForDetail(null);
  }, []);

  const handleExportSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    const selectedEmails = allEmails.filter(e => selectedIds.has(e.id)) as DisplayEmail[];

    // Generate CSV using Bison warmup API data
    const headers = ["Email", "Name", "Health", "Warmup", "Reply Rate", "Baseline Score", "Current Score", "% Change", "Daily Limit", "Total Sent", "Total Replies", "WU Bounces", "WU Replies"];
    const rows = selectedEmails.map(e => {
      const warmup = warmupStatsMap.get(e.email.toLowerCase());
      const health = warmup ? getHealthLabel(getHealthFromWarmup(warmup)).label : "Unknown";
      return [
        e.email,
        e.name,
        health,
        e.warmupEnabled !== false ? "ON" : "OFF",
        `${e.replyRate}%`,
        warmup?.baseline?.warmup_score ?? "-",
        warmup?.current?.warmup_score ?? "-",
        warmup ? `${Math.round(warmup.changes.warmup_score)}%` : "-",
        e.dailyLimit,
        e.totalSent || e.sentLast7Days,
        e.totalReplies || e.repliesLast7Days,
        warmup ? warmup.current.warmup_bounces_received_count : "-",
        warmup ? warmup.current.warmup_replies_received : "-",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `email-accounts-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success(`Exported ${selectedIds.size} email(s) to CSV`);
  }, [selectedIds, apiEmails, warmupStatsMap]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Accounts</h1>
          <p className="text-gray-500 mt-1 text-sm lg:text-base">Loading sender emails...</p>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <span className="ml-3 text-gray-600">Fetching email accounts...</span>
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
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Accounts</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">
              Monitor account health and performance trends for {summaryStats.total.toLocaleString()} sender emails
              {usingMockData && <span className="text-orange-500 ml-2">(Demo Mode)</span>}
            </p>
          </div>
          <Badge variant="outline" className="text-xs w-fit">
            📊 {selectedTimePeriod}-day comparison
          </Badge>
        </div>
      </div>

      {/* Overview Summary - Trend Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        {/* 🔥 BURN RISK Summary Card - PROMINENT */}
        <Card className={`col-span-2 lg:col-span-1 hover:shadow-lg transition-shadow ${
          burnRiskData.total > 0 
            ? "bg-gradient-to-br from-red-100 to-orange-100 border-2 border-red-400" 
            : "bg-gradient-to-br from-green-50 to-emerald-100 border-green-300"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{burnRiskData.total > 0 ? '🔥' : '✅'}</span>
              <span className={`text-xs uppercase tracking-wide font-bold ${
                burnRiskData.total > 0 ? 'text-red-600' : 'text-green-600'
              }`}>Burn Risk</span>
            </div>
            <div className={`text-3xl font-black ${burnRiskData.total > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {burnRiskData.total}
            </div>
            {burnRiskData.total > 0 ? (
              <div className="text-xs space-y-0.5 mt-1">
                {burnRiskData.critical > 0 && <div className="text-red-600">🔥🔥🔥 {burnRiskData.critical} critical</div>}
                {burnRiskData.high > 0 && <div className="text-orange-600">🔥🔥 {burnRiskData.high} high</div>}
                {burnRiskData.moderate > 0 && <div className="text-yellow-600">🔥 {burnRiskData.moderate} moderate</div>}
              </div>
            ) : (
              <div className="text-xs text-green-600 mt-1">All accounts healthy!</div>
            )}
          </CardContent>
        </Card>

        {/* Trend Summary Card */}
        <Card className="col-span-1 bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <span className="text-xs text-indigo-600 uppercase tracking-wide font-medium">Trends</span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-red-600">🔴 Declining</span>
                <span className="font-bold">{summaryStats.declining}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">🟢 Stable</span>
                <span className="font-bold">{summaryStats.stable}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">📈 Improving</span>
                <span className="font-bold">{summaryStats.improving}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Reply Rate Trend Card */}
        <Card className="col-span-1 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💬</span>
              <span className="text-xs text-blue-600 uppercase tracking-wide font-medium">Avg Reply</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {summaryStats.avgReplyRate}%
            </div>
            <div className="text-xs text-gray-400">across all accounts</div>
          </CardContent>
        </Card>

        {/* At Risk Card - using Bison warmup API data */}
        <Card className={`col-span-1 hover:shadow-lg transition-shadow ${
          droppedAccountsData.dropped.length === 0 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
          "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{droppedAccountsData.dropped.length === 0 ? "✅" : "⚠️"}</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${
                droppedAccountsData.dropped.length === 0 ? "text-green-600" : "text-red-600"
              }`}>At Risk</span>
            </div>
            <div className={`text-2xl font-bold ${droppedAccountsData.dropped.length === 0 ? "text-green-600" : "text-red-600"}`}>
              {droppedAccountsData.dropped.length}
            </div>
            <div className="text-xs text-gray-400">dropped &gt;20% in {selectedTimePeriod}d</div>
          </CardContent>
        </Card>

        {/* Warmup Status Card */}
        <Card className="col-span-1 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔥</span>
              <span className="text-xs text-orange-600 uppercase tracking-wide font-medium">Warmup</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-green-600">{summaryStats.warmupOn}</div>
              <span className="text-gray-400">/</span>
              <div className="text-lg text-gray-400">{summaryStats.warmupOff}</div>
            </div>
            <div className="text-xs text-gray-400">ON / OFF</div>
          </CardContent>
        </Card>

        {/* Declining Card */}
        <Card className={`col-span-1 hover:shadow-lg transition-shadow ${
          summaryStats.declining === 0 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
          "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{summaryStats.declining === 0 ? "✅" : "🔴"}</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${
                summaryStats.declining === 0 ? "text-green-600" : "text-red-600"
              }`}>Declining</span>
            </div>
            <div className={`text-2xl font-bold ${summaryStats.declining === 0 ? "text-green-600" : "text-red-600"}`}>
              {summaryStats.declining}
            </div>
            <div className="text-xs text-gray-400">&gt;50% drop from baseline</div>
          </CardContent>
        </Card>
      </div>

      {/* Warmup Stats Summary Row */}
      {warmupSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <Card className="col-span-2 lg:col-span-1 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🔥</span>
                <span className="text-xs text-purple-600 uppercase tracking-wide font-medium">Avg Score</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">{warmupSummary.avgScore}</div>
              <div className={`text-xs ${warmupSummary.avgScoreChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {warmupSummary.avgScoreChange >= 0 ? '↑' : '↓'} {Math.abs(warmupSummary.avgScoreChange)}% from baseline
              </div>
            </CardContent>
          </Card>

          <Card className={`col-span-1 ${warmupSummary.declining > 0 ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'}`}>
            <CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-1">🔴 Score Declining</div>
              <div className={`text-xl font-bold ${warmupSummary.declining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {warmupSummary.declining}
              </div>
              <div className="text-xs text-gray-400">&gt;20% drop</div>
            </CardContent>
          </Card>

          <Card className={`col-span-1 ${warmupSummary.warning > 0 ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}>
            <CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-1">🟡 Warning</div>
              <div className={`text-xl font-bold ${warmupSummary.warning > 0 ? 'text-yellow-600' : 'text-gray-600'}`}>
                {warmupSummary.warning}
              </div>
              <div className="text-xs text-gray-400">10-20% drop</div>
            </CardContent>
          </Card>

          <Card className="col-span-1 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-1">🟢 Stable</div>
              <div className="text-xl font-bold text-green-600">{warmupSummary.stable}</div>
              <div className="text-xs text-gray-400">Within ±10%</div>
            </CardContent>
          </Card>

          <Card className="col-span-1 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-1">📈 Improving</div>
              <div className="text-xl font-bold text-blue-600">{warmupSummary.improving}</div>
              <div className="text-xs text-gray-400">&gt;20% up</div>
            </CardContent>
          </Card>

          <Card className={`col-span-1 ${warmupSummary.bouncesIncreasing > 0 ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}>
            <CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-1">🚫 Bounces ↑</div>
              <div className={`text-xl font-bold ${warmupSummary.bouncesIncreasing > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {warmupSummary.bouncesIncreasing}
              </div>
              <div className="text-xs text-gray-400">accounts</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section - Collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-3"
        >
          <span>{showCharts ? '▼' : '▶'}</span>
          <span>📈 Trend Charts</span>
        </button>

        {showCharts && (
          <>
            {/* Overall Reply Rate Trend - Full Width with Date Picker */}
            <OverallTrendChart 
              data={usingMockData ? generateMockTrendData(60) : []} 
              loading={loading || warmupLoading}
              dateRange={trendDateRange}
              onDateRangeChange={setTrendDateRange}
              showDatePicker={true}
            />

            {/* Multi-Account Comparison - Top Declining */}
            {(topDecliningAccounts.length > 0 || usingMockData) && (
              <MultiAccountComparisonChart 
                accounts={topDecliningAccounts}
                title="Top Declining Accounts"
                dateRange={trendDateRange}
                onDateRangeChange={setTrendDateRange}
                showDatePicker={true}
                loading={warmupLoading}
              />
            )}

            {/* Expanded Account Detail View */}
            {expandedAccountData && (
              <div className="mb-6">
                <ExpandedAccountChart 
                  accountData={expandedAccountData}
                  onClose={() => setExpandedAccountId(null)}
                />
              </div>
            )}

            {/* Trend Distribution */}
            <Card className="mb-6">
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  📊 Account Health Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <TrendDistributionChart stats={filterCounts} />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* At Risk & Warning Accounts - Using Bison warmup API data */}
      {/* 🔥 LIKELY TO BURN SECTION - Based on Reply Rate Week Over Week */}
      {(droppedAccountsData.dropped.length > 0 || droppedAccountsData.warning.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* 🔥🔥 Likely to Burn: Reply rate dropped >30% */}
          {droppedAccountsData.dropped.length > 0 && (
            <Card className="border-2 border-red-400 bg-gradient-to-br from-red-50 to-red-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm lg:text-base flex items-center gap-2">
                  🔥🔥 Likely to Burn
                  <Badge variant="destructive" className="ml-auto">
                    {droppedAccountsData.dropped.length} accounts
                  </Badge>
                </CardTitle>
                <p className="text-xs text-red-600">Reply rate dropped &gt;30% week over week</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {droppedAccountsData.dropped.slice(0, 8).map((account) => (
                    <div
                      key={account.id}
                      className="p-3 rounded-lg bg-white border border-red-200 text-sm cursor-pointer hover:bg-red-50 transition-colors"
                      onClick={() => {
                        const email = apiEmails?.find(e => e.email.toLowerCase() === account.email.toLowerCase());
                        if (email) openAccountDetail(email);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-red-700 truncate flex-1">
                          {account.percentChange <= -50 ? '🔥🔥🔥' : '🔥🔥'} {account.email}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-red-600">
                        Reply Rate: Was {typeof account.fromScore === 'number' ? account.fromScore.toFixed(1) : account.fromScore}% → Now {typeof account.toScore === 'number' ? account.toScore.toFixed(1) : account.toScore}% 
                        <span className="ml-1 font-bold">(↓{Math.abs(Math.round(account.percentChange))}%)</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">This account&apos;s reply rate dropped drastically</div>
                    </div>
                  ))}
                  {droppedAccountsData.dropped.length > 8 && (
                    <button 
                      className="w-full text-sm text-red-600 hover:text-red-800 underline py-2"
                      onClick={() => handleQuickFilter("declining")}
                    >
                      View all {droppedAccountsData.dropped.length} at-risk accounts →
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 🔥 Warning: Reply rate dropped 20-30% */}
          {droppedAccountsData.warning.length > 0 && (
            <Card className="border-2 border-yellow-400 bg-gradient-to-br from-yellow-50 to-yellow-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm lg:text-base flex items-center gap-2">
                  🔥 Moderate Risk
                  <Badge variant="outline" className="ml-auto border-yellow-400 text-yellow-700">
                    {droppedAccountsData.warning.length} accounts
                  </Badge>
                </CardTitle>
                <p className="text-xs text-yellow-700">Reply rate dropped 20-30% week over week</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {droppedAccountsData.warning.slice(0, 5).map((account) => (
                    <div
                      key={account.id}
                      className="p-3 rounded-lg bg-white border border-yellow-200 text-sm cursor-pointer hover:bg-yellow-50 transition-colors"
                      onClick={() => {
                        const email = apiEmails?.find(e => e.email.toLowerCase() === account.email.toLowerCase());
                        if (email) openAccountDetail(email);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-yellow-700 truncate flex-1">🔥 {account.email}</span>
                      </div>
                      <div className="text-sm font-medium text-yellow-600">
                        Reply Rate: Was {typeof account.fromScore === 'number' ? account.fromScore.toFixed(1) : account.fromScore}% → Now {typeof account.toScore === 'number' ? account.toScore.toFixed(1) : account.toScore}%
                        <span className="ml-1 font-bold">(↓{Math.abs(Math.round(account.percentChange))}%)</span>
                      </div>
                    </div>
                  ))}
                  {droppedAccountsData.warning.length > 5 && (
                    <button 
                      className="w-full text-sm text-yellow-600 hover:text-yellow-800 underline py-2"
                      onClick={() => handleQuickFilter("warning")}
                    >
                      View all {droppedAccountsData.warning.length} warning accounts →
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Time Period Selector - Prominent placement */}
      <Card className="mb-6 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white">
        <CardContent className="pt-4 px-4 pb-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📅</span>
              <div>
                <div className="text-sm font-semibold text-gray-800">Historical Comparison</div>
                <div className="text-xs text-gray-500">Compare performance to previous period</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="px-4 py-2.5 border-2 border-indigo-300 rounded-lg text-sm bg-white font-medium text-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={selectedTimePeriod}
                onChange={(e) => setSelectedTimePeriod(Number(e.target.value) as 7 | 14 | 30)}
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
              {warmupLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats for Selected Period - REPLY RATE BASED */}
      <Card className="mb-6 bg-gray-50">
        <CardContent className="pt-4 px-4 pb-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            📊 Reply Rate Changes in the last {selectedTimePeriod} days:
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className={`p-3 rounded-lg text-center cursor-pointer transition-all hover:scale-105 ${droppedAccountsData.dropped.length > 0 ? 'bg-red-100 border-2 border-red-300' : 'bg-gray-100'}`}
                 onClick={() => droppedAccountsData.dropped.length > 0 && handleQuickFilter("declining")}>
              <div className={`text-2xl font-bold ${droppedAccountsData.dropped.length > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {droppedAccountsData.dropped.length}
              </div>
              <div className="text-xs text-gray-600">🔥🔥 Likely to Burn</div>
              <div className="text-xs text-red-500 font-medium">(&gt;30% reply rate drop)</div>
            </div>
            <div className={`p-3 rounded-lg text-center cursor-pointer transition-all hover:scale-105 ${droppedAccountsData.warning.length > 0 ? 'bg-yellow-100 border-2 border-yellow-300' : 'bg-gray-100'}`}
                 onClick={() => droppedAccountsData.warning.length > 0 && handleQuickFilter("warning")}>
              <div className={`text-2xl font-bold ${droppedAccountsData.warning.length > 0 ? 'text-yellow-600' : 'text-gray-600'}`}>
                {droppedAccountsData.warning.length}
              </div>
              <div className="text-xs text-gray-600">🔥 Moderate Risk</div>
              <div className="text-xs text-yellow-600 font-medium">(20-30% reply rate drop)</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-green-100 border border-green-200 cursor-pointer transition-all hover:scale-105"
                 onClick={() => handleQuickFilter("stable")}>
              <div className="text-2xl font-bold text-green-600">
                {droppedAccountsData.stable.length}
              </div>
              <div className="text-xs text-gray-600">🟢 Stable</div>
              <div className="text-xs text-green-600">(within ±20%)</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-blue-100 border border-blue-200 cursor-pointer transition-all hover:scale-105"
                 onClick={() => handleQuickFilter("improving")}>
              <div className="text-2xl font-bold text-blue-600">
                {droppedAccountsData.improved.length}
              </div>
              <div className="text-xs text-gray-600">📈 Improving</div>
              <div className="text-xs text-blue-600">(&gt;20% reply rate up)</div>
            </div>
            <div className="p-3 rounded-lg text-center bg-purple-100 border border-purple-200">
              <div className={`text-2xl font-bold ${droppedAccountsData.avgChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {droppedAccountsData.avgChange >= 0 ? '+' : ''}{droppedAccountsData.avgChange}%
              </div>
              <div className="text-xs text-gray-600">📉 Avg Reply Rate Change</div>
              <div className="text-xs text-gray-400">(all accounts)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 🔥🔥🔥 LIKELY TO BURN - Reply Rate Dropped Significantly */}
      {droppedAccountsData.dropped.length > 0 && (
        <Card className="mb-6 border-2 border-red-400 bg-gradient-to-r from-red-100 to-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-2xl">🔥🔥</span>
              Likely to Burn - Reply Rate Dropping in Last {selectedTimePeriod} Days
              <Badge variant="destructive" className="ml-2 text-base px-3 py-1">
                {droppedAccountsData.dropped.length} accounts at risk
              </Badge>
            </CardTitle>
            <p className="text-sm text-red-600 mt-1">
              These accounts have reply rates dropping &gt;30% week over week - high burn risk!
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {droppedAccountsData.dropped.slice(0, 10).map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-white border-2 border-red-300 hover:bg-red-50 transition-colors cursor-pointer shadow-sm"
                  onClick={() => {
                    const email = apiEmails?.find(e => e.email.toLowerCase() === account.email.toLowerCase());
                    if (email) openAccountDetail(email);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-red-700 text-sm truncate flex items-center gap-2">
                      {account.percentChange <= -50 ? '🔥🔥🔥 CRITICAL:' : '🔥🔥 HIGH RISK:'} {account.email}
                    </div>
                    <div className="text-sm text-red-600 mt-1 font-medium">
                      Reply Rate: Was {typeof account.fromScore === 'number' ? account.fromScore.toFixed(1) : account.fromScore}% → Now {typeof account.toScore === 'number' ? account.toScore.toFixed(1) : account.toScore}%
                      <span className="font-bold ml-1">(↓{Math.abs(Math.round(account.percentChange))}%)</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">This account&apos;s reply rate dropped drastically</div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 sm:mt-0">
                    <Badge variant="destructive" className="whitespace-nowrap text-base px-3 py-1">
                      {account.percentChange <= -50 ? '🔥🔥🔥' : '🔥🔥'} ↓{Math.abs(Math.round(account.percentChange))}%
                    </Badge>
                  </div>
                </div>
              ))}
              {droppedAccountsData.dropped.length > 10 && (
                <div className="text-center py-2">
                  <button
                    onClick={() => handleQuickFilter("declining")}
                    className="text-sm text-red-600 hover:text-red-800 underline font-medium"
                  >
                    View all {droppedAccountsData.dropped.length} at-risk accounts →
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Improved Accounts Section - Show if there are improved accounts */}
      {droppedAccountsData.improved.length > 0 && droppedAccountsData.dropped.length === 0 && (
        <Card className="mb-6 border-2 border-green-300 bg-gradient-to-r from-green-50 to-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-2xl">🎉</span>
              Accounts Improving in Last {selectedTimePeriod} Days
              <Badge className="ml-2 text-base px-3 py-1 bg-green-600">
                {droppedAccountsData.improved.length} accounts
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {droppedAccountsData.improved.slice(0, 5).map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{account.email}</div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 sm:mt-0">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{account.fromScore}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium">{account.toScore}</span>
                    </div>
                    <Badge className="whitespace-nowrap text-sm px-2 py-0.5 bg-green-600">
                      ↑ {Math.round(account.percentChange)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Filter Buttons - Based on Reply Rate Changes */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleQuickFilter("all")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "all"
              ? "bg-gray-900 text-white shadow-lg"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          📋 All ({filterCounts.all})
        </button>
        <button
          onClick={() => handleQuickFilter("declining")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "declining"
              ? "bg-red-600 text-white shadow-lg"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          🔥🔥 Show Declining ({filterCounts.declining})
        </button>
        <button
          onClick={() => handleQuickFilter("warning")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "warning"
              ? "bg-yellow-500 text-white shadow-lg"
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          🔥 Moderate Risk ({filterCounts.warning})
        </button>
        <button
          onClick={() => handleQuickFilter("stable")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "stable"
              ? "bg-green-600 text-white shadow-lg"
              : "bg-green-100 text-green-700 hover:bg-green-200"
          }`}
        >
          🟢 Stable ({filterCounts.stable})
        </button>
        <button
          onClick={() => handleQuickFilter("improving")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "improving"
              ? "bg-blue-600 text-white shadow-lg"
              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }`}
        >
          📈 Improving ({filterCounts.improving})
        </button>
      </div>

      {/* Filters */}
      <Card className="mb-4 lg:mb-6">
        <CardContent className="pt-4 lg:pt-6 px-4 lg:px-6">
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="flex-1">
              <Input
                placeholder="🔍 Search by email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  updateURL(healthFilter, warmupFilter, e.target.value, sortBy, sortOrder);
                }}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={warmupFilter}
                onChange={(e) => {
                  const newWarmup = e.target.value as "on" | "off" | "all";
                  setWarmupFilter(newWarmup);
                  setPage(1);
                  updateURL(healthFilter, newWarmup, search, sortBy, sortOrder);
                }}
              >
                <option value="all">🔥 All Warmup</option>
                <option value="on">✅ Warmup ON</option>
                <option value="off">⏸️ Warmup OFF</option>
              </select>
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={sortBy}
                onChange={(e) => {
                  const newSort = e.target.value as "replyRate" | "dailyLimit" | "totalSent";
                  setSortBy(newSort);
                  setPage(1);
                  updateURL(healthFilter, warmupFilter, search, newSort, sortOrder);
                }}
              >
                <option value="replyRate">📊 Sort: Reply Rate</option>
                <option value="dailyLimit">📈 Sort: Daily Limit</option>
                <option value="totalSent">📤 Sort: Total Sent</option>
              </select>
              <button
                onClick={() => {
                  const newOrder = sortOrder === "asc" ? "desc" : "asc";
                  setSortOrder(newOrder);
                  updateURL(healthFilter, warmupFilter, search, sortBy, newOrder);
                }}
                className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                title={sortOrder === "asc" ? "Lowest first" : "Highest first"}
              >
                {sortOrder === "asc" ? "↑ Low→High" : "↓ High→Low"}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection Info Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm bg-blue-50 p-3 rounded-lg border border-blue-200">
          <span className="font-medium text-blue-600">✓ {selectedIds.size} selected</span>
          {selectedIds.size < total && (
            <button
              onClick={selectAllFiltered}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Select all {total} matching
            </button>
          )}
          <button
            onClick={clearSelection}
            className="text-gray-500 hover:text-gray-700 underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {/* Select All for Mobile */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <Checkbox
            checked={allOnPageSelected}
            indeterminate={someOnPageSelected && !allOnPageSelected}
            onChange={selectAllOnPage}
          />
          <span className="text-sm text-gray-600">
            {allOnPageSelected ? "Deselect all on page" : "Select all on page"}
          </span>
        </div>

        {(emails as DisplayEmail[]).map((email) => {
          const hasSends = (email.totalSent || email.sentLast7Days) > 0;
          const isSelected = selectedIds.has(email.id);
          const warmupEnabled = email.warmupEnabled !== false && email.warmupStatus !== "paused";
          const trend = calculateAccountTrend(email.id);
          
          // Get warmup stats for this account from Bison API
          const warmupStats = warmupStatsMap.get(email.email.toLowerCase());
          const health = getHealthFromWarmup(warmupStats);
          const healthInfo = getHealthLabel(health);
          const periodChange = warmupStats?.changes?.warmup_score;
          const hasSignificantDrop = periodChange !== undefined && periodChange < -20;
          const hasWarningDrop = periodChange !== undefined && periodChange >= -20 && periodChange < -10;
          const hasImproved = periodChange !== undefined && periodChange > 10;

          return (
            <Card
              key={email.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "ring-2 ring-blue-500 bg-blue-50" :
                hasSignificantDrop ? "border-red-300 bg-red-50 ring-1 ring-red-200" :
                hasWarningDrop ? "border-yellow-300 bg-yellow-50" :
                health === "declining" ? "border-red-200 bg-red-50" :
                health === "warning" ? "border-yellow-200 bg-yellow-50" :
                "hover:bg-gray-50"
              }`}
              onClick={() => openAccountDetail(email)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelectEmail(email.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-2">
                          <span className="text-lg">{healthInfo.emoji}</span>
                          {email.email}
                        </div>
                        <div className="text-xs text-gray-500">{email.name}</div>
                      </div>
                      {/* Period change badge */}
                      {periodChange !== undefined && Math.abs(periodChange) > 10 && (
                        <Badge 
                          variant={hasSignificantDrop || hasWarningDrop ? "destructive" : "default"}
                          className={`ml-2 text-xs ${hasImproved ? 'bg-green-600' : ''}`}
                        >
                          {periodChange > 0 ? '↑' : '↓'} {Math.abs(Math.round(periodChange))}% in {selectedTimePeriod}d
                        </Badge>
                      )}
                      {/* View detail indicator */}
                      <span className="text-gray-400 text-lg ml-2">›</span>
                    </div>

                    {/* Health Status - Using Bison warmup API data */}
                    <div className="bg-white rounded-lg p-3 mb-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">📊 Health Trend</span>
                        <span className={`text-xs font-medium ${healthInfo.color}`}>
                          {healthInfo.label}
                        </span>
                      </div>
                      <TrendChangeDisplay warmup={warmupStats} compact />
                    </div>

                    {/* Reply Rate Visual */}
                    <div className="bg-white rounded-lg p-3 mb-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">💬 Current Reply Rate</span>
                        {trend && trend.replyRates.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedAccountId(expandedAccountId === email.id ? null : email.id);
                            }}
                            className="hover:scale-110 transition-transform"
                            title="Click to view full trend"
                          >
                            <EnhancedSparkline data={trend.replyRates} width={70} height={24} />
                          </button>
                        )}
                      </div>
                      <ReplyRateBar rate={email.replyRate} hasSends={hasSends} />
                    </div>

                    {/* View Trend Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mb-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedAccountId(expandedAccountId === email.id ? null : email.id);
                      }}
                    >
                      {expandedAccountId === email.id ? '📊 Hide Trend' : '📈 View Full Trend'}
                    </Button>

                    {/* Warmup Stats (from API) */}
                    <WarmupStatsCard warmup={warmupStatsMap.get(email.email.toLowerCase())} />

                    {/* Warmup Stage */}
                    <div className="bg-white rounded-lg p-3 border mb-3 mt-3">
                      <div className="text-xs text-gray-500 mb-2">🔥 Warmup Stage</div>
                      <WarmupStageIndicator dailyLimit={email.dailyLimit} warmupEnabled={warmupEnabled} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">📅 Active</div>
                        <div className="font-medium">{email.daysActive ?? getDaysActive(email.createdAt)}d</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">📤 Sent</div>
                        <div className="font-medium">{(email.totalSent || email.sentLast7Days).toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">💬 Replies</div>
                        <div className="font-medium">{(email.totalReplies || email.repliesLast7Days).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-4 w-12">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={selectAllOnPage}
                      title={allOnPageSelected ? "Deselect all" : "Select all"}
                    />
                  </th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">📧 Email</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">🔥 Burn Risk</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">Health</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">Trend</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">
                    <button
                      onClick={() => {
                        setSortBy("replyRate");
                        const newOrder = sortBy === "replyRate" ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
                        setSortOrder(newOrder);
                        updateURL(healthFilter, warmupFilter, search, "replyRate", newOrder);
                      }}
                      className="hover:text-gray-900 flex items-center gap-1 mx-auto"
                    >
                      💬 Reply Rate
                      {sortBy === "replyRate" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">
                    <button
                      onClick={() => {
                        setSortBy("dailyLimit");
                        const newOrder = sortBy === "dailyLimit" ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
                        setSortOrder(newOrder);
                        updateURL(healthFilter, warmupFilter, search, "dailyLimit", newOrder);
                      }}
                      className="hover:text-gray-900 flex items-center gap-1 mx-auto"
                    >
                      🔥 Warmup Stage
                      {sortBy === "dailyLimit" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">🔥 WU Score</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">
                    📅 {selectedTimePeriod}d Change
                  </th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">🚫 Bounces</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">📈 Sparkline</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">
                    <button
                      onClick={() => {
                        setSortBy("totalSent");
                        const newOrder = sortBy === "totalSent" ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
                        setSortOrder(newOrder);
                        updateURL(healthFilter, warmupFilter, search, "totalSent", newOrder);
                      }}
                      className="hover:text-gray-900 flex items-center gap-1 ml-auto"
                    >
                      📤 Sent
                      {sortBy === "totalSent" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">💬 Replies</th>
                </tr>
              </thead>
              <tbody>
                {(emails as DisplayEmail[]).map((email) => {
                  const hasSends = (email.totalSent || email.sentLast7Days) > 0;
                  const isSelected = selectedIds.has(email.id);
                  const warmupEnabled = email.warmupEnabled !== false && email.warmupStatus !== "paused";
                  const trend = calculateAccountTrend(email.id);
                  
                  // Get warmup stats for this account from Bison API
                  const warmupStats = warmupStatsMap.get(email.email.toLowerCase());
                  const health = getHealthFromWarmup(warmupStats);
                  const periodChange = warmupStats?.changes?.warmup_score;
                  const hasSignificantDrop = periodChange !== undefined && periodChange < -20;
                  const hasWarningDrop = periodChange !== undefined && periodChange >= -20 && periodChange < -10;
                  const hasImproved = periodChange !== undefined && periodChange > 10;
                  
                  // 🔥 Calculate burn risk for this account
                  const burnRisk = calculateBurnRisk(warmupStats);
                  const burnRiskClasses = getBurnRiskClasses(burnRisk.level);

                  return (
                    <tr
                      key={email.id}
                      className={`border-b cursor-pointer transition-all ${
                        isSelected ? "bg-blue-50" :
                        burnRisk.level === 'critical' ? "bg-red-200 hover:bg-red-300" :
                        burnRisk.level === 'high' ? "bg-orange-100 hover:bg-orange-200" :
                        burnRisk.level === 'moderate' ? "bg-yellow-100 hover:bg-yellow-200" :
                        hasSignificantDrop ? "bg-red-100 hover:bg-red-200" :
                        hasWarningDrop ? "bg-yellow-50 hover:bg-yellow-100" :
                        health === "declining" ? "bg-red-50 hover:bg-red-100" :
                        health === "warning" ? "bg-yellow-50 hover:bg-yellow-100" :
                        "hover:bg-gray-50"
                      }`}
                      onClick={() => openAccountDetail(email)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectEmail(email.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {/* 🔥 Burn Risk Indicator */}
                          {burnRisk.level !== 'low' && (
                            <span className="text-xl" title={`${burnRisk.level.toUpperCase()} RISK: ${burnRisk.score}/100`}>
                              {burnRisk.emoji}
                            </span>
                          )}
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {email.email}
                              {/* 🔥 Burn Risk Badge */}
                              {burnRisk.level !== 'low' && (
                                <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${burnRiskClasses.badge}`}>
                                  {burnRisk.score}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{email.name}</div>
                          </div>
                          {/* Period change badge (only show if not at burn risk) */}
                          {burnRisk.level === 'low' && periodChange !== undefined && Math.abs(periodChange) > 10 && (
                            <Badge 
                              variant={hasSignificantDrop || hasWarningDrop ? "destructive" : "default"}
                              className={`text-xs whitespace-nowrap ${hasImproved ? 'bg-green-600' : ''}`}
                            >
                              {periodChange > 0 ? '↑' : '↓'} {Math.abs(Math.round(periodChange))}% in {selectedTimePeriod}d
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {/* 🔥 Burn Risk Column */}
                        {burnRisk.level !== 'low' ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xl">{burnRisk.emoji}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded text-white ${burnRiskClasses.badge}`}>
                              {burnRisk.score}/100
                            </span>
                            <span className={`text-xs ${burnRiskClasses.text}`}>{burnRisk.level}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-lg">✅</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <TrendHealthIndicator warmup={warmupStats} />
                      </td>
                      <td className="p-4">
                        <TrendChangeDisplay warmup={warmupStats} compact />
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <ReplyRateBar rate={email.replyRate} hasSends={hasSends} />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <WarmupStageIndicator dailyLimit={email.dailyLimit} warmupEnabled={warmupEnabled} />
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {(() => {
                          const warmup = warmupStatsMap.get(email.email.toLowerCase());
                          if (!warmup) return <span className="text-xs text-gray-400">-</span>;
                          const changeIcon = warmup.changes.warmup_score > 5 ? '↑' : warmup.changes.warmup_score < -5 ? '↓' : '';
                          const changeColor = warmup.changes.warmup_score > 5 ? 'text-green-600' : warmup.changes.warmup_score < -5 ? 'text-red-600' : '';
                          return (
                            <div className="flex flex-col items-center">
                              <span className="font-medium">{warmup.current.warmup_score}</span>
                              {changeIcon && (
                                <span className={`text-xs ${changeColor}`}>
                                  {changeIcon}{Math.abs(Math.round(warmup.changes.warmup_score))}%
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-center">
                        {(() => {
                          if (periodChange === undefined) return <span className="text-xs text-gray-400">-</span>;
                          const absChange = Math.abs(Math.round(periodChange));
                          if (absChange < 5) return <span className="text-xs text-gray-500">—</span>;
                          
                          const isDropped = periodChange < -20;
                          const isWarning = periodChange >= -20 && periodChange < -10;
                          const isImproved = periodChange > 10;
                          
                          return (
                            <div className={`flex flex-col items-center font-semibold ${
                              isDropped ? 'text-red-600' :
                              isWarning ? 'text-yellow-600' :
                              isImproved ? 'text-green-600' :
                              'text-gray-600'
                            }`}>
                              <span className="text-lg">
                                {periodChange > 0 ? '↑' : '↓'} {absChange}%
                              </span>
                              {isDropped && <span className="text-xs">🔴 Big drop</span>}
                              {isImproved && <span className="text-xs">📈 Improving</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-center">
                        {(() => {
                          const warmup = warmupStatsMap.get(email.email.toLowerCase());
                          if (!warmup) return <span className="text-xs text-gray-400">-</span>;
                          const bounces = warmup.current.warmup_bounces_received_count;
                          const change = warmup.changes.warmup_bounces_received_count;
                          return (
                            <div className={`flex flex-col items-center ${bounces > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                              <span className="font-medium">{bounces}</span>
                              {change > 0 && (
                                <span className="text-xs text-red-600">+{change}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {trend && trend.replyRates.length > 1 ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedAccountId(expandedAccountId === email.id ? null : email.id);
                              }}
                              className="hover:scale-110 transition-transform cursor-pointer"
                              title="Click to expand chart"
                            >
                              <EnhancedSparkline data={trend.replyRates} width={70} height={24} />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right text-gray-600 font-medium">
                        {(email.totalSent || email.sentLast7Days).toLocaleString()}
                      </td>
                      <td className="p-4 text-right text-gray-600 font-medium">
                        {(email.totalReplies || email.repliesLast7Days).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
        <div className="text-xs lg:text-sm text-gray-500">
          Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total.toLocaleString()}
          {sortBy === "replyRate" && sortOrder === "asc" && (
            <span className="text-orange-600 ml-2">• ⚠️ Sorted by lowest reply rate</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </Button>
          <div className="flex items-center gap-1">
            {[...Array(Math.min(3, totalPages))].map((_, i) => {
              const pageNum = page <= 2 ? i + 1 : page + i - 1;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className="w-8 lg:w-10"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar - Fixed at bottom */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t shadow-lg z-50 p-3 lg:p-4 mb-16 lg:mb-0">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✓</span>
              <span className="font-semibold text-blue-600">{selectedIds.size}</span>
              <span className="text-gray-600">selected</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSelected}
              >
                📥 Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Account Detail Modal */}
      <AccountDetailModal
        account={selectedAccountForDetail}
        isOpen={isDetailModalOpen}
        onClose={closeAccountDetail}
      />
    </div>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Accounts</h1>
          <p className="text-gray-500 mt-1 text-sm lg:text-base">Loading...</p>
        </div>
      </div>
    }>
      <EmailsPageContent />
    </Suspense>
  );
}
