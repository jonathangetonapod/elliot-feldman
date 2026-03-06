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
  Sparkline as EnhancedSparkline,
} from "@/components/trend-charts";
import { AccountDetailModal, type AccountDetailData } from "@/components/account-detail-modal";
import { InfoTooltip } from "@/components/info-tooltip";

interface BisonSenderEmail {
  id: number;
  email: string;
  name: string;
  status: string; // "Connected", "Disconnected", etc. from Bison API
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
    connectionStatus: bisonEmail.status?.toLowerCase() === 'connected' ? 'connected' : 'disconnected',
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
  connectionStatus?: "connected" | "disconnected";
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
    reasons.push(`Warmup Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
    reasons.push(`Warmup reply rate dropped drastically`);
  }
  // Risk factor 2: Reply rate dropped 30-50% - HIGH (+35)
  // 🔥🔥 High: Reply rate dropped 30-50% week over week
  else if (replyRateChange <= -30) {
    riskScore += 35;
    reasons.push(`Warmup Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
    reasons.push(`Warmup reply rate declining significantly`);
  }
  // Risk factor 3: Reply rate dropped 20-30% - MODERATE (+20)
  // 🔥 Moderate: Reply rate dropped 20-30% week over week  
  else if (replyRateChange <= -20) {
    riskScore += 20;
    reasons.push(`Warmup Reply Rate: Was ${baselineReplyRate.toFixed(1)}% → Now ${currentReplyRate.toFixed(1)}% (↓${Math.abs(Math.round(replyRateChange))}%)`);
  }

  // Additional risk: Very low current reply rate (+20 if <1%)
  if (currentReplyRate < 1 && warmup.current.warmup_emails_sent > 10) {
    riskScore += 20;
    reasons.push(`Current warmup reply rate critically low (${currentReplyRate.toFixed(1)}%)`);
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

    // Calculate average warmup reply rate from warmup API data
    let totalWarmupReplyRate = 0;
    let warmupReplyRateCount = 0;
    for (const email of allEmails) {
      const warmup = warmupStatsMap.get(email.email.toLowerCase());
      if (warmup && warmup.current.warmup_emails_sent > 0) {
        totalWarmupReplyRate += warmup.current.warmup_reply_rate;
        warmupReplyRateCount++;
      }
    }
    const avgReplyRate = warmupReplyRateCount > 0
      ? Math.round((totalWarmupReplyRate / warmupReplyRateCount) * 100) / 100
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
        default: {
          // Sort by warmup reply rate from warmup API, fallback to 0
          const aWarmup = warmupStatsMap.get(a.email.toLowerCase());
          const bWarmup = warmupStatsMap.get(b.email.toLowerCase());
          aVal = aWarmup?.current?.warmup_reply_rate ?? 0;
          bVal = bWarmup?.current?.warmup_reply_rate ?? 0;
        }
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

  // Open account detail modal
  const openAccountDetail = useCallback((email: DisplayEmail) => {
    const accountData: AccountDetailData = {
      id: email.id,
      email: email.email,
      name: email.name,
      domain: email.domain,
      status: email.status,
      warmupEnabled: email.warmupEnabled !== false && email.warmupStatus !== "paused",
      dailyLimit: email.dailyLimit,
      totalSent: email.totalSent || email.sentLast7Days,
      totalReplies: email.totalReplies || email.repliesLast7Days,
      createdAt: email.createdAt || new Date().toISOString(),
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
    const headers = ["Email", "Name", "Health", "Warmup", "WU Reply Rate", "Baseline Score", "Current Score", "% Change", "Daily Limit", "Total Sent", "Total Replies", "WU Bounces", "WU Replies"];
    const rows = selectedEmails.map(e => {
      const warmup = warmupStatsMap.get(e.email.toLowerCase());
      const health = warmup ? getHealthLabel(getHealthFromWarmup(warmup)).label : "Unknown";
      return [
        e.email,
        e.name,
        health,
        e.warmupEnabled !== false ? "ON" : "OFF",
        `${warmup?.current?.warmup_reply_rate ?? 0}%`,
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
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-500 mt-1 text-sm">Loading sender emails...</p>
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <p className="text-gray-500 mt-1 text-sm">
          {summaryStats.total.toLocaleString()} sender emails — warmup reply rate shows how email providers treat each account.
          {usingMockData && <span className="text-orange-500 ml-2">(Demo Mode)</span>}
        </p>
      </div>

      {/* Overview — 3 key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Needs Attention */}
        <Card className={`${
          burnRiskData.total > 0
            ? "border-l-4 border-l-red-500"
            : "border-l-4 border-l-green-500"
        }`}>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Needs Attention</div>
            <div className={`text-3xl font-bold ${burnRiskData.total > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {burnRiskData.total}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {burnRiskData.total > 0
                ? `${burnRiskData.critical} critical · ${burnRiskData.high} high · ${burnRiskData.moderate} moderate`
                : "All accounts healthy"
              }
            </div>
          </CardContent>
        </Card>

        {/* Avg Reply Rate */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-xs text-gray-500 uppercase tracking-wide mb-1">
              Avg WU Reply Rate
              <InfoTooltip text="Average warmup reply rate across all accounts. Healthy: 20-40%. Below 10%: concern." />
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {summaryStats.avgReplyRate}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Healthy range: 20-40%
            </div>
          </CardContent>
        </Card>

        {/* Account Health Breakdown */}
        <Card className="border-l-4 border-l-gray-300">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Account Health</div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-0.5 flex-1 h-3 rounded-full overflow-hidden">
                {summaryStats.declining > 0 && (
                  <div className="bg-red-500 h-full" style={{ width: `${(summaryStats.declining / summaryStats.total) * 100}%` }} />
                )}
                {summaryStats.warning > 0 && (
                  <div className="bg-yellow-400 h-full" style={{ width: `${(summaryStats.warning / summaryStats.total) * 100}%` }} />
                )}
                {summaryStats.stable > 0 && (
                  <div className="bg-green-500 h-full" style={{ width: `${(summaryStats.stable / summaryStats.total) * 100}%` }} />
                )}
                {summaryStats.improving > 0 && (
                  <div className="bg-blue-500 h-full" style={{ width: `${(summaryStats.improving / summaryStats.total) * 100}%` }} />
                )}
              </div>
            </div>
            <div className="flex gap-3 text-xs mt-2 text-gray-600 flex-wrap">
              {summaryStats.declining > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />{summaryStats.declining} declining</span>}
              {summaryStats.warning > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />{summaryStats.warning} warning</span>}
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{summaryStats.stable} stable</span>
              {summaryStats.improving > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />{summaryStats.improving} improving</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* At-Risk Accounts — collapsible, only shows when there are issues */}
      {(droppedAccountsData.dropped.length > 0 || droppedAccountsData.warning.length > 0) && (
        <details className="mb-6 group" open={droppedAccountsData.dropped.length > 0}>
          <summary className="cursor-pointer list-none">
            <Card className={`${droppedAccountsData.dropped.length > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-yellow-400'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${droppedAccountsData.dropped.length > 0 ? 'text-red-700' : 'text-yellow-700'}`}>
                      {droppedAccountsData.dropped.length > 0
                        ? `${droppedAccountsData.dropped.length} accounts likely to burn`
                        : `${droppedAccountsData.warning.length} accounts to watch`
                      }
                    </span>
                    {droppedAccountsData.warning.length > 0 && droppedAccountsData.dropped.length > 0 && (
                      <span className="text-xs text-yellow-600">+ {droppedAccountsData.warning.length} moderate risk</span>
                    )}
                    <InfoTooltip text="Likely to burn: warmup reply rate dropped more than 30% vs last period. Moderate risk: dropped 20–30%. A dropping reply rate means email providers are losing trust in this account." />
                  </div>
                  <span className="text-gray-400 text-sm group-open:rotate-90 transition-transform">&#9654;</span>
                </div>
              </CardContent>
            </Card>
          </summary>
          <div className="mt-2 space-y-2">
            {droppedAccountsData.dropped.slice(0, 8).map((account) => {
              const toRate = typeof account.toScore === 'number' ? account.toScore : 0;
              const reason = toRate < 10
                ? 'Reply rate is critically low — consider pausing this account'
                : toRate < 20
                ? 'Reply rate dropped below 20% healthy threshold — monitor closely'
                : 'Reply rate is dropping fast — may burn out if trend continues';
              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 text-sm cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => {
                    const email = apiEmails?.find(e => e.email.toLowerCase() === account.email.toLowerCase());
                    if (email) openAccountDetail(email);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-red-700 truncate">{account.email}</div>
                    <div className="text-xs text-red-600">
                      WU Reply Rate: {typeof account.fromScore === 'number' ? account.fromScore.toFixed(1) : account.fromScore}% → {typeof account.toScore === 'number' ? account.toScore.toFixed(1) : account.toScore}%
                    </div>
                    <div className="text-xs text-red-500 mt-0.5">{reason}</div>
                  </div>
                  <span className="text-red-600 font-bold text-sm ml-3 whitespace-nowrap">
                    ↓{Math.abs(Math.round(account.percentChange))}%
                  </span>
                </div>
              );
            })}
            {droppedAccountsData.warning.slice(0, 5).map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm cursor-pointer hover:bg-yellow-100 transition-colors"
                onClick={() => {
                  const email = apiEmails?.find(e => e.email.toLowerCase() === account.email.toLowerCase());
                  if (email) openAccountDetail(email);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-yellow-700 truncate">{account.email}</div>
                  <div className="text-xs text-yellow-600">
                    WU Reply Rate: {typeof account.fromScore === 'number' ? account.fromScore.toFixed(1) : account.fromScore}% → {typeof account.toScore === 'number' ? account.toScore.toFixed(1) : account.toScore}%
                  </div>
                  <div className="text-xs text-yellow-500 mt-0.5">Reply rate dipping — if it keeps dropping, may need to pause</div>
                </div>
                <span className="text-yellow-600 font-bold text-sm ml-3 whitespace-nowrap">
                  ↓{Math.abs(Math.round(account.percentChange))}%
                </span>
              </div>
            ))}
            {(droppedAccountsData.dropped.length > 8 || droppedAccountsData.warning.length > 5) && (
              <button
                onClick={() => handleQuickFilter("declining")}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                View all in table →
              </button>
            )}
          </div>
        </details>
      )}

      {/* Filters — single consolidated bar */}
      <div className="flex flex-col gap-3 mb-4">
        {/* Row 1: Search + time period + warmup filter */}
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search by email or name..."
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
              className="px-3 py-2 border rounded-md text-sm bg-white"
              value={selectedTimePeriod}
              onChange={(e) => setSelectedTimePeriod(Number(e.target.value) as 7 | 14 | 30)}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            {warmupLoading && (
              <div className="flex items-center px-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
              </div>
            )}
            <select
              className="px-3 py-2 border rounded-md text-sm bg-white"
              value={warmupFilter}
              onChange={(e) => {
                const newWarmup = e.target.value as "on" | "off" | "all";
                setWarmupFilter(newWarmup);
                setPage(1);
                updateURL(healthFilter, newWarmup, search, sortBy, sortOrder);
              }}
            >
              <option value="all">All Warmup</option>
              <option value="on">Warmup ON</option>
              <option value="off">Warmup OFF</option>
            </select>
            <select
              className="px-3 py-2 border rounded-md text-sm bg-white"
              value={sortBy}
              onChange={(e) => {
                const newSort = e.target.value as "replyRate" | "dailyLimit" | "totalSent";
                setSortBy(newSort);
                setPage(1);
                updateURL(healthFilter, warmupFilter, search, newSort, sortOrder);
              }}
            >
              <option value="replyRate">Sort: WU Reply Rate</option>
              <option value="dailyLimit">Sort: Daily Limit</option>
              <option value="totalSent">Sort: Total Sent</option>
            </select>
            <button
              onClick={() => {
                const newOrder = sortOrder === "asc" ? "desc" : "asc";
                setSortOrder(newOrder);
                updateURL(healthFilter, warmupFilter, search, sortBy, newOrder);
              }}
              className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50 bg-white"
              title={sortOrder === "asc" ? "Lowest first" : "Highest first"}
            >
              {sortOrder === "asc" ? "↑ Low first" : "↓ High first"}
            </button>
          </div>
        </div>

        {/* Row 2: Quick filters */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: "all" as const, label: "All", desc: "", count: filterCounts.all, activeClass: "bg-gray-900 text-white", inactiveClass: "bg-gray-100 text-gray-700 hover:bg-gray-200" },
            { key: "declining" as const, label: "Declining", desc: "Reply rate dropped >50%", count: filterCounts.declining, activeClass: "bg-red-600 text-white", inactiveClass: "bg-red-50 text-red-700 hover:bg-red-100" },
            { key: "warning" as const, label: "Warning", desc: "Reply rate dropped 30-50%", count: filterCounts.warning, activeClass: "bg-yellow-500 text-white", inactiveClass: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
            { key: "stable" as const, label: "Stable", desc: "Reply rate within ±30%", count: filterCounts.stable, activeClass: "bg-green-600 text-white", inactiveClass: "bg-green-50 text-green-700 hover:bg-green-100" },
            { key: "improving" as const, label: "Improving", desc: "Reply rate up >30%", count: filterCounts.improving, activeClass: "bg-blue-600 text-white", inactiveClass: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
          ]).map(({ key, label, desc, count, activeClass, inactiveClass }) => (
            <button
              key={key}
              onClick={() => handleQuickFilter(key)}
              title={desc}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                healthFilter === key ? activeClass : inactiveClass
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        {/* Explanation of selected filter */}
        {healthFilter !== "all" && (
          <div className="text-xs text-gray-500 mt-1.5 ml-1">
            {healthFilter === "declining" && "Accounts where warmup reply rate dropped more than 50% vs the prior period — these may be burning out."}
            {healthFilter === "warning" && "Accounts where warmup reply rate dropped 30–50% vs the prior period — keep an eye on these."}
            {healthFilter === "stable" && "Accounts where warmup reply rate is within ±30% of the prior period — no action needed."}
            {healthFilter === "improving" && "Accounts where warmup reply rate increased more than 30% vs the prior period — getting healthier."}
          </div>
        )}
      </div>

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
      <div className="lg:hidden space-y-2">
        {(emails as DisplayEmail[]).map((email) => {
          const isSelected = selectedIds.has(email.id);
          const warmupStats = warmupStatsMap.get(email.email.toLowerCase());
          const health = getHealthFromWarmup(warmupStats);
          const healthInfo = getHealthLabel(health);
          const burnRisk = calculateBurnRisk(warmupStats);
          const wuRate = warmupStats?.current?.warmup_reply_rate ?? 0;
          const wuHasSends = (warmupStats?.current?.warmup_emails_sent ?? 0) > 0;

          return (
            <div
              key={email.id}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected ? "ring-2 ring-blue-500 bg-blue-50" :
                burnRisk.level === 'critical' ? "bg-red-50 border-red-200" :
                burnRisk.level === 'high' ? "bg-orange-50 border-orange-200" :
                "bg-white hover:bg-gray-50"
              }`}
              onClick={() => openAccountDetail(email)}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleSelectEmail(email.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  {/* Row 1: Email + status */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{email.email}</div>
                      <div className="text-xs text-gray-400">{email.name}</div>
                    </div>
                    {email.connectionStatus === 'disconnected' ? (
                      <span className="text-xs text-gray-400">Disconnected</span>
                    ) : burnRisk.level !== 'low' ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${getBurnRiskClasses(burnRisk.level).badge}`}>
                        {burnRisk.level === 'critical' ? 'CRITICAL' : burnRisk.level === 'high' ? 'HIGH' : 'WATCH'}
                      </span>
                    ) : (
                      <span className={`text-xs ${healthInfo.color}`}>{healthInfo.label}</span>
                    )}
                  </div>
                  {/* Row 2: Key metrics */}
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-gray-500">Reply: </span>
                      <span className={`font-medium ${wuRate < 10 ? 'text-red-600' : wuRate >= 20 ? 'text-green-600' : 'text-gray-700'}`}>
                        {wuHasSends ? `${Math.round(wuRate * 10) / 10}%` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Score: </span>
                      <span className="font-medium">{wuHasSends ? warmupStats?.current?.warmup_score : '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Sent: </span>
                      <span className="font-medium">{(email.totalSent || email.sentLast7Days).toLocaleString()}</span>
                    </div>
                    {(warmupStats?.current?.warmup_bounces_received_count ?? 0) > 0 && (
                      <div>
                        <span className="text-red-600 font-medium">
                          {warmupStats!.current.warmup_bounces_received_count} bounces
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View — 7 columns: checkbox, email, status, reply rate, score, bounces, activity */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left p-3 w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={selectAllOnPage}
                      title={allOnPageSelected ? "Deselect all" : "Select all"}
                    />
                  </th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-center p-3">
                    <span className="inline-flex items-center gap-1">
                      Status
                      <InfoTooltip text="Based on warmup reply rate change vs the prior period. Declining: dropped >50%. Warning: dropped 30-50%. Stable: within ±30%. Improving: up >30%. Disconnected: account not connected to Bison." />
                    </span>
                  </th>
                  <th className="text-center p-3">
                    <span
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-900"
                      onClick={() => {
                        setSortBy("replyRate");
                        const newOrder = sortBy === "replyRate" ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
                        setSortOrder(newOrder);
                        updateURL(healthFilter, warmupFilter, search, "replyRate", newOrder);
                      }}
                    >
                      WU Reply Rate
                      <InfoTooltip text="% of warmup emails that got replies. Healthy: 20-40%. Below 10%: concern. Measures how email providers treat this account." />
                      {sortBy === "replyRate" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </span>
                  </th>
                  <th className="text-center p-3">
                    <span className="inline-flex items-center gap-1">
                      Score
                      <InfoTooltip text="Warmup health score from Bison. Higher = better deliverability. Drops mean email providers are losing trust." />
                    </span>
                  </th>
                  <th className="text-center p-3">
                    <span className="inline-flex items-center gap-1">
                      Bounces
                      <InfoTooltip text="Warmup emails that bounced. Rising bounces = email providers rejecting this account." />
                    </span>
                  </th>
                  <th className="text-right p-3">
                    <span
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 ml-auto"
                      onClick={() => {
                        setSortBy("totalSent");
                        const newOrder = sortBy === "totalSent" ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
                        setSortOrder(newOrder);
                        updateURL(healthFilter, warmupFilter, search, "totalSent", newOrder);
                      }}
                    >
                      Activity
                      {sortBy === "totalSent" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(emails as DisplayEmail[]).map((email) => {
                  const isSelected = selectedIds.has(email.id);
                  const warmupStats = warmupStatsMap.get(email.email.toLowerCase());
                  const health = getHealthFromWarmup(warmupStats);
                  const healthInfo = getHealthLabel(health);
                  const burnRisk = calculateBurnRisk(warmupStats);
                  const wuRate = warmupStats?.current?.warmup_reply_rate ?? 0;
                  const wuHasSends = (warmupStats?.current?.warmup_emails_sent ?? 0) > 0;

                  // Row color: only tint for burn risk or selected
                  const rowClass = isSelected ? "bg-blue-50" :
                    burnRisk.level === 'critical' ? "bg-red-50" :
                    burnRisk.level === 'high' ? "bg-orange-50" :
                    "hover:bg-gray-50";

                  return (
                    <tr
                      key={email.id}
                      className={`border-b cursor-pointer transition-colors ${rowClass}`}
                      onClick={() => openAccountDetail(email)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectEmail(email.id)}
                        />
                      </td>
                      {/* Account */}
                      <td className="p-3">
                        <div className="font-medium text-sm">{email.email}</div>
                        <div className="text-xs text-gray-400">{email.name}</div>
                      </td>
                      {/* Status — merged burn risk + health + trend */}
                      <td className="p-3 text-center">
                        {(() => {
                          const replyRateChange = warmupStats?.changes?.warmup_reply_rate ?? 0;
                          const currentRate = warmupStats?.current?.warmup_reply_rate ?? 0;

                          if (email.connectionStatus === 'disconnected') {
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                                <span className="text-xs text-gray-400">Disconnected</span>
                                <InfoTooltip text="This account is not connected to Bison. Reconnect it to resume warmup and tracking." />
                              </div>
                            );
                          }
                          if (burnRisk.level !== 'low') {
                            const tipText = burnRisk.level === 'critical'
                              ? `Reply rate dropped ${Math.abs(Math.round(replyRateChange))}% vs last period. Currently at ${currentRate.toFixed(1)}%. Consider pausing campaigns from this account.`
                              : burnRisk.level === 'high'
                              ? `Reply rate dropped ${Math.abs(Math.round(replyRateChange))}% vs last period. Currently at ${currentRate.toFixed(1)}%. Monitor closely — may need to pause soon.`
                              : `Reply rate dropped ${Math.abs(Math.round(replyRateChange))}% vs last period. Currently at ${currentRate.toFixed(1)}%. Keep an eye on it.`;
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${getBurnRiskClasses(burnRisk.level).badge}`}>
                                  {burnRisk.level === 'critical' ? 'CRITICAL' : burnRisk.level === 'high' ? 'HIGH RISK' : 'MODERATE'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  ↓{Math.abs(Math.round(burnRisk.replyRateChange ?? 0))}% reply rate
                                </span>
                                <InfoTooltip text={tipText} />
                              </div>
                            );
                          }
                          const tipText = health === 'improving'
                            ? `Reply rate increased ${Math.round(replyRateChange)}% vs last period. Currently at ${currentRate.toFixed(1)}%. Account is getting healthier.`
                            : health === 'declining'
                            ? `Reply rate dropped ${Math.abs(Math.round(replyRateChange))}% vs last period. Currently at ${currentRate.toFixed(1)}%. Watch for further drops.`
                            : health === 'warning'
                            ? `Reply rate dropped ${Math.abs(Math.round(replyRateChange))}% vs last period. Currently at ${currentRate.toFixed(1)}%. Trending down.`
                            : !warmupStats
                            ? 'No warmup data available for this account yet.'
                            : `Reply rate is steady (${replyRateChange >= 0 ? '+' : ''}${Math.round(replyRateChange)}% change). Currently at ${currentRate.toFixed(1)}%. No action needed.`;
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`inline-block w-2 h-2 rounded-full ${
                                health === 'declining' ? 'bg-red-500' :
                                health === 'warning' ? 'bg-yellow-400' :
                                health === 'improving' ? 'bg-blue-500' :
                                'bg-green-500'
                              }`} />
                              <span className={`text-xs ${healthInfo.color}`}>{healthInfo.label}</span>
                              <InfoTooltip text={tipText} />
                            </div>
                          );
                        })()}
                      </td>
                      {/* WU Reply Rate */}
                      <td className="p-3">
                        <div className="flex justify-center">
                          <ReplyRateBar rate={Math.round(wuRate * 100) / 100} hasSends={wuHasSends} />
                        </div>
                      </td>
                      {/* Score */}
                      <td className="p-3 text-center">
                        {(() => {
                          if (!warmupStats || !wuHasSends) return <span className="text-xs text-gray-400">-</span>;
                          const score = warmupStats.current.warmup_score;
                          const change = warmupStats.changes.warmup_score;
                          const changeColor = change > 5 ? 'text-green-600' : change < -5 ? 'text-red-600' : 'text-gray-400';
                          return (
                            <div>
                              <span className="font-medium text-sm">{score}</span>
                              {Math.abs(change) >= 5 && (
                                <span className={`text-xs ml-1 ${changeColor}`}>
                                  {change > 0 ? '+' : ''}{Math.round(change)}%
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {/* Bounces */}
                      <td className="p-3 text-center">
                        {(() => {
                          if (!warmupStats || !wuHasSends) return <span className="text-xs text-gray-400">-</span>;
                          const bounces = warmupStats.current.warmup_bounces_received_count;
                          const change = warmupStats.changes.warmup_bounces_received_count;
                          return (
                            <span className={`text-sm ${bounces > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {bounces}{change > 0 ? ` (+${change})` : ''}
                            </span>
                          );
                        })()}
                      </td>
                      {/* Activity — sent / replies merged */}
                      <td className="p-3 text-right">
                        <div className="text-sm text-gray-700">
                          {(email.totalSent || email.sentLast7Days).toLocaleString()} sent
                        </div>
                        <div className="text-xs text-gray-400">
                          {(email.totalReplies || email.repliesLast7Days).toLocaleString()} replies
                        </div>
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
            <span className="text-orange-600 ml-2">• ⚠️ Sorted by lowest warmup reply rate</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-500 mt-1 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <EmailsPageContent />
    </Suspense>
  );
}
