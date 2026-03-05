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
  takeSnapshot,
  calculateAccountTrend,
  getDaysActive,
  analyzeAccountTrend,
  getHealthLabel,
  getOverallReplyRateTrend,
  predictAtRiskAccounts,
  getRecentlyDegraded,
  type AccountTrend,
  type TrendHealth,
  type HistoricalTrendAnalysis,
} from "@/lib/account-history";

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
    trendAnalysis: null, // Will be populated after
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
  trendAnalysis?: HistoricalTrendAnalysis | null;
};

// Mini Sparkline component for reply rate history
function MiniSparkline({ data, width = 60, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <span className="text-xs text-gray-400">—</span>;
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

// NEW: Trend-based health indicator
function TrendHealthIndicator({ analysis }: { analysis: HistoricalTrendAnalysis | null | undefined }) {
  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-gray-400 text-sm">📊</span>
        <span className="text-xs text-gray-400">No data</span>
      </div>
    );
  }
  
  const { emoji, label, color } = getHealthLabel(analysis.health);
  
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-lg">{emoji}</span>
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  );
}

// NEW: Trend change display (Was X% → Now Y%)
function TrendChangeDisplay({ analysis, compact = false }: { analysis: HistoricalTrendAnalysis | null | undefined; compact?: boolean }) {
  if (!analysis) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  
  if (analysis.health === 'gathering-data') {
    return (
      <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>
        <span className="text-gray-400">
          {analysis.daysOfData} day{analysis.daysOfData !== 1 ? 's' : ''} of data
        </span>
        <span className="text-gray-300 mx-1">•</span>
        <span>Need 7+ days</span>
      </div>
    );
  }
  
  const changeIcon = analysis.percentChange > 0 ? '↑' : analysis.percentChange < 0 ? '↓' : '→';
  const changeColor = analysis.percentChange > 0 ? 'text-green-600' : analysis.percentChange < 0 ? 'text-red-600' : 'text-gray-500';
  
  if (compact) {
    return (
      <div className="text-xs">
        <span className="text-gray-500">{analysis.baselineAvg}%</span>
        <span className="text-gray-300 mx-1">→</span>
        <span className={changeColor}>{analysis.currentAvg}%</span>
        <span className={`ml-1 ${changeColor}`}>
          ({changeIcon}{Math.abs(analysis.percentChange)}%)
        </span>
      </div>
    );
  }
  
  return (
    <div className="text-sm">
      <div className="text-gray-500 mb-1">
        Was <span className="font-medium">{analysis.baselineAvg}%</span> avg (14d)
      </div>
      <div className={changeColor}>
        Now <span className="font-medium">{analysis.currentAvg}%</span> (7d) = {changeIcon}{Math.abs(analysis.percentChange)}%
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
        <span className="text-gray-400 text-sm">—</span>
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

// Mini Pie Chart for Account Health - Updated for trend-based health
function MiniHealthPie({ stats }: { stats: { declining: number; warning: number; stable: number; improving: number; gatheringData: number } }) {
  const data = [
    { name: "Stable", value: stats.stable, color: "#22c55e" },
    { name: "Improving", value: stats.improving, color: "#3b82f6" },
    { name: "Warning", value: stats.warning, color: "#eab308" },
    { name: "Declining", value: stats.declining, color: "#ef4444" },
    { name: "Gathering Data", value: stats.gatheringData, color: "#9ca3af" },
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

// Trend Distribution Pie Chart (larger version)
function TrendDistributionChart({ stats }: { stats: { declining: number; warning: number; stable: number; improving: number; gatheringData: number } }) {
  const data = [
    { name: "Stable", value: stats.stable, color: "#22c55e" },
    { name: "Improving", value: stats.improving, color: "#3b82f6" },
    { name: "Warning", value: stats.warning, color: "#eab308" },
    { name: "Declining", value: stats.declining, color: "#ef4444" },
    { name: "New", value: stats.gatheringData, color: "#9ca3af" },
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
  const [trendAnalysisMap, setTrendAnalysisMap] = useState<Map<number, HistoricalTrendAnalysis>>(new Map());
  
  // Trends data
  const [overallTrend, setOverallTrend] = useState<ReturnType<typeof getOverallReplyRateTrend>>([]);
  const [atRiskAccounts, setAtRiskAccounts] = useState<ReturnType<typeof predictAtRiskAccounts>>([]);
  const [recentlyDegraded, setRecentlyDegraded] = useState<Array<{
    accountId: number;
    email: string;
    fromStatus: TrendHealth;
    toStatus: TrendHealth;
    percentDrop: number;
  }>>([]);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Charts visibility toggle
  const [showCharts, setShowCharts] = useState(true);
  
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

  // Take snapshot for history tracking when emails load
  useEffect(() => {
    if (loading || !apiEmails || apiEmails.length === 0) return;
    
    // Transform to the format expected by takeSnapshot
    const accountData = (apiEmails as DisplayEmail[]).map(e => ({
      id: e.id,
      email: e.email,
      replyRate: e.replyRate,
      sentLast7Days: e.sentLast7Days,
      totalSent: e.totalSent,
      repliesLast7Days: e.repliesLast7Days,
      totalReplies: e.totalReplies,
      dailyLimit: e.dailyLimit,
    }));
    
    // Take snapshot (will only save once per day)
    takeSnapshot(accountData);
    
    // Calculate trend analysis for all accounts
    const analysisMap = new Map<number, HistoricalTrendAnalysis>();
    for (const email of apiEmails) {
      const analysis = analyzeAccountTrend(email.id, email.replyRate);
      if (analysis) {
        analysisMap.set(email.id, analysis);
      }
    }
    setTrendAnalysisMap(analysisMap);
    
    // Load trends data
    setOverallTrend(getOverallReplyRateTrend());
    setAtRiskAccounts(predictAtRiskAccounts(7));
    setRecentlyDegraded(getRecentlyDegraded(7));
  }, [loading, apiEmails]);

  // Calculate stats for the summary bar - now trend-based
  const summaryStats = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    
    const warmupOn = allEmails.filter(e => (e as DisplayEmail).warmupEnabled !== false && e.warmupStatus !== "paused").length;
    const warmupOff = allEmails.filter(e => (e as DisplayEmail).warmupEnabled === false || e.warmupStatus === "paused").length;
    
    // Calculate average reply rate (only for accounts with sends)
    const emailsWithSends = allEmails.filter(e => e.sentLast7Days > 0 || (e as DisplayEmail).totalSent && (e as DisplayEmail).totalSent! > 0);
    const avgReplyRate = emailsWithSends.length > 0 
      ? emailsWithSends.reduce((sum, e) => sum + e.replyRate, 0) / emailsWithSends.length
      : 0;
    
    // Count by trend-based health
    let declining = 0;
    let warning = 0;
    let stable = 0;
    let improving = 0;
    let gatheringData = 0;
    
    for (const email of allEmails) {
      const analysis = trendAnalysisMap.get(email.id);
      if (!analysis) {
        gatheringData++;
      } else {
        switch (analysis.health) {
          case 'declining': declining++; break;
          case 'warning': warning++; break;
          case 'stable': stable++; break;
          case 'improving': improving++; break;
          case 'gathering-data': gatheringData++; break;
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
      gatheringData,
    };
  }, [apiEmails, trendAnalysisMap]);

  // Calculate counts for quick filters (before filtering)
  const filterCounts = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    
    let declining = 0;
    let warning = 0;
    let stable = 0;
    let improving = 0;
    let gatheringData = 0;
    
    for (const email of allEmails) {
      const analysis = trendAnalysisMap.get(email.id);
      if (!analysis) {
        gatheringData++;
      } else {
        switch (analysis.health) {
          case 'declining': declining++; break;
          case 'warning': warning++; break;
          case 'stable': stable++; break;
          case 'improving': improving++; break;
          case 'gathering-data': gatheringData++; break;
        }
      }
    }
    
    return {
      all: allEmails.length,
      declining,
      warning,
      stable,
      improving,
      gatheringData,
    };
  }, [apiEmails, trendAnalysisMap]);

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
    
    // Health filter (trend-based)
    if (healthFilter !== "all") {
      filteredEmails = filteredEmails.filter((e) => {
        const analysis = trendAnalysisMap.get(e.id);
        if (!analysis) return healthFilter === "gathering-data";
        return analysis.health === healthFilter;
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
  }, [apiEmails, page, pageSize, search, healthFilter, warmupFilter, sortBy, sortOrder, trendAnalysisMap]);

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

  const handleExportSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    const selectedEmails = allEmails.filter(e => selectedIds.has(e.id)) as DisplayEmail[];
    
    // Generate CSV
    const headers = ["Email", "Name", "Health", "Warmup", "Reply Rate", "Baseline Avg", "Current Avg", "% Change", "Daily Limit", "Total Sent", "Total Replies"];
    const rows = selectedEmails.map(e => {
      const analysis = trendAnalysisMap.get(e.id);
      const health = analysis ? getHealthLabel(analysis.health).label : "No Data";
      return [
        e.email,
        e.name,
        health,
        e.warmupEnabled !== false ? "ON" : "OFF",
        `${e.replyRate}%`,
        analysis ? `${analysis.baselineAvg}%` : "-",
        analysis ? `${analysis.currentAvg}%` : "-",
        analysis && analysis.health !== 'gathering-data' ? `${analysis.percentChange}%` : "-",
        e.dailyLimit,
        e.totalSent || e.sentLast7Days,
        e.totalReplies || e.repliesLast7Days,
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
  }, [selectedIds, apiEmails, trendAnalysisMap]);

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

  // Calculate history days
  const historyDays = overallTrend.length;

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
            {historyDays} day{historyDays !== 1 ? 's' : ''} of history
          </Badge>
        </div>
      </div>

      {/* Overview Summary - Trend Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {/* Trend Summary Card */}
        <Card className="col-span-2 lg:col-span-1 bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <span className="text-xs text-indigo-600 uppercase tracking-wide font-medium">Trend Summary</span>
            </div>
            <div className="text-sm space-y-1">
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

        {/* At Risk Card */}
        <Card className={`col-span-1 hover:shadow-lg transition-shadow ${
          atRiskAccounts.length === 0 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
          "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{atRiskAccounts.length === 0 ? "✅" : "⚠️"}</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${
                atRiskAccounts.length === 0 ? "text-green-600" : "text-red-600"
              }`}>At Risk</span>
            </div>
            <div className={`text-2xl font-bold ${atRiskAccounts.length === 0 ? "text-green-600" : "text-red-600"}`}>
              {atRiskAccounts.length}
            </div>
            <div className="text-xs text-gray-400">may decline further</div>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Reply Rate Over Time */}
            <Card>
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  💬 Reply Rate Over Time
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 lg:px-6">
                {overallTrend.length > 1 ? (
                  <div className="h-48">
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
                  <div className="h-48 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <span className="text-3xl block mb-2">📊</span>
                      <p className="text-sm">Chart will appear after 2+ days of data</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trend Distribution */}
            <Card>
              <CardHeader className="pb-2 px-3 lg:px-6">
                <CardTitle className="text-sm lg:text-lg flex items-center gap-2">
                  📊 Account Health Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6">
                <TrendDistributionChart stats={filterCounts} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* At Risk & Recently Degraded (Collapsed by default on mobile) */}
      {(atRiskAccounts.length > 0 || recentlyDegraded.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* At Risk Accounts */}
          {atRiskAccounts.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm lg:text-base flex items-center gap-2">
                  ⚠️ At Risk Accounts
                  <Badge variant="outline" className="ml-auto text-xs border-red-200 text-red-700">
                    {atRiskAccounts.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {atRiskAccounts.slice(0, 5).map((account) => (
                    <div 
                      key={account.accountId}
                      className="p-2 rounded-lg bg-red-50 border border-red-100 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate flex-1">{account.email}</span>
                        <span className="text-red-600 text-xs ml-2">{account.currentReplyRate}%</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{account.reason}</div>
                    </div>
                  ))}
                  {atRiskAccounts.length > 5 && (
                    <div className="text-xs text-center text-gray-500">
                      +{atRiskAccounts.length - 5} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recently Degraded */}
          {recentlyDegraded.length > 0 && (
            <Card className="border-yellow-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm lg:text-base flex items-center gap-2">
                  📉 Recently Degraded
                  <Badge variant="outline" className="ml-auto text-xs border-yellow-200 text-yellow-700">
                    {recentlyDegraded.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentlyDegraded.slice(0, 5).map((item, index) => {
                    const healthInfo = getHealthLabel(item.toStatus);
                    return (
                      <div 
                        key={`${item.accountId}-${index}`}
                        className="p-2 rounded-lg bg-yellow-50 border border-yellow-100 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate flex-1">{item.email}</span>
                          <span className={`text-xs ml-2 ${healthInfo.color}`}>
                            {healthInfo.emoji} ↓{item.percentDrop}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {recentlyDegraded.length > 5 && (
                    <div className="text-xs text-center text-gray-500">
                      +{recentlyDegraded.length - 5} more
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Filter Buttons - Trend-based */}
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
          🔴 Declining ({filterCounts.declining})
        </button>
        <button
          onClick={() => handleQuickFilter("warning")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "warning"
              ? "bg-yellow-500 text-white shadow-lg"
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          🟡 Warning ({filterCounts.warning})
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
        <button
          onClick={() => handleQuickFilter("gathering-data")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            healthFilter === "gathering-data"
              ? "bg-gray-600 text-white shadow-lg"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          📊 New ({filterCounts.gatheringData})
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
          const trendAnalysis = trendAnalysisMap.get(email.id);
          const healthInfo = trendAnalysis ? getHealthLabel(trendAnalysis.health) : null;
          
          return (
            <Card 
              key={email.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "ring-2 ring-blue-500 bg-blue-50" : 
                trendAnalysis?.health === "declining" ? "border-red-200 bg-red-50" :
                trendAnalysis?.health === "warning" ? "border-yellow-200 bg-yellow-50" :
                "hover:bg-gray-50"
              }`}
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
                          {healthInfo && <span className="text-lg">{healthInfo.emoji}</span>}
                          {email.email}
                        </div>
                        <div className="text-xs text-gray-500">{email.name}</div>
                      </div>
                    </div>
                    
                    {/* Health Status - NEW */}
                    <div className="bg-white rounded-lg p-3 mb-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">📊 Health Trend</span>
                        {healthInfo && (
                          <span className={`text-xs font-medium ${healthInfo.color}`}>
                            {healthInfo.label}
                          </span>
                        )}
                      </div>
                      <TrendChangeDisplay analysis={trendAnalysis} compact />
                    </div>
                    
                    {/* Reply Rate Visual */}
                    <div className="bg-white rounded-lg p-3 mb-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">💬 Current Reply Rate</span>
                        {trend && trend.replyRates.length > 1 && (
                          <MiniSparkline data={trend.replyRates.map(r => r.rate)} />
                        )}
                      </div>
                      <ReplyRateBar rate={email.replyRate} hasSends={hasSends} />
                    </div>
                    
                    {/* Warmup Stage */}
                    <div className="bg-white rounded-lg p-3 border mb-3">
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
                  <th className="text-center p-4 font-medium text-sm text-gray-600">📅 Days Active</th>
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
                  const trendAnalysis = trendAnalysisMap.get(email.id);
                  
                  return (
                    <tr 
                      key={email.id} 
                      className={`border-b cursor-pointer transition-all ${
                        isSelected ? "bg-blue-50" : 
                        trendAnalysis?.health === "declining" ? "bg-red-50 hover:bg-red-100" :
                        trendAnalysis?.health === "warning" ? "bg-yellow-50 hover:bg-yellow-100" :
                        "hover:bg-gray-50"
                      }`}
                      onClick={() => toggleSelectEmail(email.id)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectEmail(email.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{email.email}</div>
                          <div className="text-xs text-gray-500">{email.name}</div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <TrendHealthIndicator analysis={trendAnalysis} />
                      </td>
                      <td className="p-4">
                        <TrendChangeDisplay analysis={trendAnalysis} compact />
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
                      <td className="p-4 text-center text-gray-600">
                        <span className="text-sm">{email.daysActive ?? getDaysActive(email.createdAt)}d</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {trend && trend.replyRates.length > 1 && (
                            <MiniSparkline data={trend.replyRates.map(r => r.rate)} />
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
