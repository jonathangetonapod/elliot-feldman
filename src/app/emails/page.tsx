"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getEmails, type EmailStatus, type WarmupStatus, type SenderEmail } from "@/lib/mock-data";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  takeSnapshot,
  calculateAccountTrend,
  getDaysActive,
  type AccountTrend,
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
function transformBisonEmail(bisonEmail: BisonSenderEmail): SenderEmail {
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
  
  // Determine health status based on reply rate
  let status: EmailStatus;
  if (bisonEmail.status === "disconnected") {
    status = "burned";
  } else if (replyRate >= 2) {
    status = "healthy";
  } else if (replyRate >= 1) {
    status = "warning";
  } else if (emailsSent === 0) {
    // New accounts with no sends are neutral (warning)
    status = "warning";
  } else {
    status = "burned";
  }
  
  return {
    id: bisonEmail.id,
    email: bisonEmail.email,
    name: bisonEmail.name || bisonEmail.email.split("@")[0],
    domain,
    status,
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
  } as DisplayEmail;
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

// Trend indicator for accounts
function AccountTrendIndicator({ trend }: { trend: AccountTrend | null | undefined }) {
  if (!trend) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  
  const config = {
    improving: { icon: '↑', color: 'text-green-600' },
    stable: { icon: '→', color: 'text-gray-500' },
    declining: { icon: '↓', color: 'text-red-600' },
  };
  
  const { icon, color } = config[trend.trend];
  
  return (
    <span className={`text-sm font-medium ${color}`} title={`${trend.replyRateChange > 0 ? '+' : ''}${trend.replyRateChange}%`}>
      {icon}
    </span>
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
  const color = rate < 1 ? "bg-red-500" : rate < 2 ? "bg-yellow-500" : "bg-green-500";
  const emoji = rate < 1 ? "🔴" : rate < 2 ? "🟡" : "🟢";
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-sm font-semibold ${rate < 1 ? "text-red-600" : rate < 2 ? "text-yellow-600" : "text-green-600"}`}>
        {emoji} {rate}%
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

// Status Icon Component
function StatusIcon({ status }: { status: EmailStatus }) {
  switch (status) {
    case "healthy":
      return <span className="text-2xl" title="Healthy">✅</span>;
    case "warning":
      return <span className="text-2xl" title="Warning">⚠️</span>;
    case "burned":
      return <span className="text-2xl" title="Burned">🔴</span>;
  }
}

// Mini Pie Chart for Account Health
function MiniHealthPie({ stats }: { stats: { healthy: number; warning: number; burned: number } }) {
  const data = [
    { name: "Healthy", value: stats.healthy, color: "#22c55e" },
    { name: "Warning", value: stats.warning, color: "#eab308" },
    { name: "Burned", value: stats.burned, color: "#ef4444" },
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
  const [statusFilter, setStatusFilter] = useState<EmailStatus | "all">(
    (searchParams.get("status") as EmailStatus | "all") || "all"
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
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);
  
  const pageSize = 25;

  // Update URL when filters change
  const updateURL = useCallback((
    newStatus: EmailStatus | "all", 
    newWarmup: "on" | "off" | "all", 
    newSearch: string,
    newSort: string,
    newOrder: string
  ) => {
    const params = new URLSearchParams();
    if (newStatus !== "all") params.set("status", newStatus);
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
      status: e.status,
      dailyLimit: e.dailyLimit,
    }));
    
    // Take snapshot (will only save once per day)
    takeSnapshot(accountData);
  }, [loading, apiEmails]);

  // Calculate stats for the summary bar
  const summaryStats = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    
    const warmupOn = allEmails.filter(e => (e as DisplayEmail).warmupEnabled !== false && e.warmupStatus !== "paused").length;
    const warmupOff = allEmails.filter(e => (e as DisplayEmail).warmupEnabled === false || e.warmupStatus === "paused").length;
    
    // Calculate average reply rate (only for accounts with sends)
    const emailsWithSends = allEmails.filter(e => e.sentLast7Days > 0 || (e as DisplayEmail).totalSent && (e as DisplayEmail).totalSent! > 0);
    const avgReplyRate = emailsWithSends.length > 0 
      ? emailsWithSends.reduce((sum, e) => sum + e.replyRate, 0) / emailsWithSends.length
      : 0;
    
    const atRisk = allEmails.filter(e => e.replyRate < 1 && (e.sentLast7Days > 0 || ((e as DisplayEmail).totalSent ?? 0) > 0)).length;
    const performing = allEmails.filter(e => e.replyRate >= 2).length;
    
    return {
      total: allEmails.length,
      warmupOn,
      warmupOff,
      avgReplyRate: Math.round(avgReplyRate * 100) / 100,
      atRisk,
      performing,
    };
  }, [apiEmails]);

  // Calculate counts for quick filters (before filtering)
  const filterCounts = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    return {
      all: allEmails.length,
      burned: allEmails.filter(e => e.status === "burned").length,
      warning: allEmails.filter(e => e.status === "warning").length,
      healthy: allEmails.filter(e => e.status === "healthy").length,
      atRisk: allEmails.filter(e => e.replyRate < 1 && (e.sentLast7Days > 0 || ((e as DisplayEmail).totalSent ?? 0) > 0)).length,
    };
  }, [apiEmails]);

  // Quick filter handlers
  const handleQuickFilter = (type: "all" | "burned" | "warning" | "healthy" | "atRisk") => {
    let newStatus: EmailStatus | "all" = "all";
    
    if (type === "burned") {
      newStatus = "burned";
    } else if (type === "warning") {
      newStatus = "warning";
    } else if (type === "healthy") {
      newStatus = "healthy";
    }
    
    setStatusFilter(newStatus);
    setPage(1);
    updateURL(newStatus, warmupFilter, search, sortBy, sortOrder);
  };

  // Check which quick filter is active
  const activeQuickFilter = useMemo(() => {
    if (statusFilter === "burned") return "burned";
    if (statusFilter === "warning") return "warning";
    if (statusFilter === "healthy") return "healthy";
    if (statusFilter === "all" && warmupFilter === "all") return "all";
    return null;
  }, [statusFilter, warmupFilter]);

  // Filter and paginate emails
  const { data: emails, total, totalPages, filteredEmails: allFilteredEmails } = useMemo(() => {
    // Use mock data if API data not available
    if (apiEmails === null) {
      const result = getEmails({
        page,
        pageSize,
        search,
        status: statusFilter,
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
    
    // Status filter
    if (statusFilter !== "all") {
      filteredEmails = filteredEmails.filter((e) => e.status === statusFilter);
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
  }, [apiEmails, page, pageSize, search, statusFilter, warmupFilter, sortBy, sortOrder]);

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

  // Bulk action handlers
  const handleEnableWarmup = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    setBulkActionLoading("enable");
    try {
      const response = await fetch("/api/bison?endpoint=sender-emails/warmup/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email_ids: Array.from(selectedIds) }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Failed to enable warmup");
      }
      
      toast.success(`Warmup enabled for ${selectedIds.size} email(s)`);
      
      // Update local state
      setApiEmails(prev => {
        if (!prev) return prev;
        return prev.map(email => {
          if (selectedIds.has(email.id)) {
            return { ...email, warmupEnabled: true, warmupStatus: "warming" as WarmupStatus };
          }
          return email;
        });
      });
      
      clearSelection();
    } catch (error) {
      toast.error(`Failed to enable warmup: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBulkActionLoading(null);
    }
  }, [selectedIds, clearSelection]);

  const handleDisableWarmup = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    setBulkActionLoading("disable");
    try {
      const response = await fetch("/api/bison?endpoint=sender-emails/warmup/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_email_ids: Array.from(selectedIds) }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Failed to disable warmup");
      }
      
      toast.success(`Warmup disabled for ${selectedIds.size} email(s)`);
      
      // Update local state
      setApiEmails(prev => {
        if (!prev) return prev;
        return prev.map(email => {
          if (selectedIds.has(email.id)) {
            return { ...email, warmupEnabled: false, warmupStatus: "paused" as WarmupStatus };
          }
          return email;
        });
      });
      
      clearSelection();
    } catch (error) {
      toast.error(`Failed to disable warmup: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBulkActionLoading(null);
    }
  }, [selectedIds, clearSelection]);

  const handleExportSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    const selectedEmails = allEmails.filter(e => selectedIds.has(e.id)) as DisplayEmail[];
    
    // Generate CSV
    const headers = ["Email", "Name", "Status", "Warmup", "Reply Rate", "Daily Limit", "Total Sent", "Total Replies"];
    const rows = selectedEmails.map(e => [
      e.email,
      e.name,
      e.status,
      e.warmupEnabled !== false ? "ON" : "OFF",
      `${e.replyRate}%`,
      e.dailyLimit,
      e.totalSent || e.sentLast7Days,
      e.totalReplies || e.repliesLast7Days,
    ]);
    
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
  }, [selectedIds, apiEmails]);

  const getReplyRateColor = (rate: number, hasSends: boolean) => {
    if (!hasSends) return "text-gray-400";
    if (rate < 1) return "text-red-600 font-semibold";
    if (rate < 2) return "text-yellow-600 font-medium";
    return "text-green-600 font-semibold";
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Email Accounts</h1>
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
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Email Accounts</h1>
        <p className="text-gray-500 mt-1 text-sm lg:text-base">
          Monitor warmup and reply rates for {summaryStats.total.toLocaleString()} sender emails
          {usingMockData && <span className="text-orange-500 ml-2">(Demo Mode)</span>}
        </p>
      </div>

      {/* Visual Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {/* Warmup Status Card */}
        <Card className="col-span-1 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔥</span>
              <span className="text-xs text-orange-600 uppercase tracking-wide font-medium">Warmup</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-green-600">{summaryStats.warmupOn}</div>
              <span className="text-gray-400">/</span>
              <div className="text-lg text-gray-400">{summaryStats.warmupOff}</div>
            </div>
            <div className="text-xs text-gray-500">ON / OFF</div>
            {/* Mini progress bar */}
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${(summaryStats.warmupOn / summaryStats.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Reply Rate Card */}
        <Card className={`col-span-1 hover:shadow-lg transition-shadow ${
          summaryStats.avgReplyRate >= 2 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
          summaryStats.avgReplyRate >= 1 ? "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200" :
          "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💬</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${
                summaryStats.avgReplyRate >= 2 ? "text-green-600" :
                summaryStats.avgReplyRate >= 1 ? "text-yellow-600" : "text-red-600"
              }`}>Avg Reply Rate</span>
            </div>
            <div className={`text-2xl font-bold ${getReplyRateColor(summaryStats.avgReplyRate, true)}`}>
              {summaryStats.avgReplyRate >= 2 ? "🟢" : summaryStats.avgReplyRate >= 1 ? "🟡" : "🔴"} {summaryStats.avgReplyRate}%
            </div>
            <div className="text-xs text-gray-400">across all accounts</div>
          </CardContent>
        </Card>

        {/* At Risk Card */}
        <Card className={`col-span-1 hover:shadow-lg transition-shadow ${
          summaryStats.atRisk === 0 ? "bg-gradient-to-br from-green-50 to-green-100 border-green-200" :
          "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{summaryStats.atRisk === 0 ? "✅" : "⚠️"}</span>
              <span className={`text-xs uppercase tracking-wide font-medium ${
                summaryStats.atRisk === 0 ? "text-green-600" : "text-red-600"
              }`}>At Risk</span>
            </div>
            <div className={`text-2xl font-bold ${summaryStats.atRisk === 0 ? "text-green-600" : "text-red-600"}`}>
              {summaryStats.atRisk}
            </div>
            <div className="text-xs text-gray-400">&lt;1% reply rate</div>
          </CardContent>
        </Card>

        {/* Performing Card */}
        <Card className="col-span-1 bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🏆</span>
              <span className="text-xs text-green-600 uppercase tracking-wide font-medium">Performing</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{summaryStats.performing}</div>
            <div className="text-xs text-gray-400">&gt;2% reply rate</div>
          </CardContent>
        </Card>

        {/* Health Distribution Card with Mini Pie */}
        <Card className="col-span-2 lg:col-span-1 hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <span className="text-xs text-gray-600 uppercase tracking-wide font-medium">Health</span>
            </div>
            <div className="flex items-center gap-3">
              <MiniHealthPie stats={filterCounts} />
              <div className="flex flex-col text-xs gap-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ✅ {filterCounts.healthy}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  ⚠️ {filterCounts.warning}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  🔴 {filterCounts.burned}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Filter Buttons - Now more visual */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleQuickFilter("all")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            activeQuickFilter === "all"
              ? "bg-gray-900 text-white shadow-lg"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          📋 All ({filterCounts.all})
        </button>
        <button
          onClick={() => handleQuickFilter("burned")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            activeQuickFilter === "burned"
              ? "bg-red-600 text-white shadow-lg"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          🔴 Burned ({filterCounts.burned})
        </button>
        <button
          onClick={() => handleQuickFilter("warning")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            activeQuickFilter === "warning"
              ? "bg-yellow-500 text-white shadow-lg"
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          ⚠️ Warning ({filterCounts.warning})
        </button>
        <button
          onClick={() => handleQuickFilter("healthy")}
          className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
            activeQuickFilter === "healthy"
              ? "bg-green-600 text-white shadow-lg"
              : "bg-green-100 text-green-700 hover:bg-green-200"
          }`}
        >
          ✅ Healthy ({filterCounts.healthy})
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
                  updateURL(statusFilter, warmupFilter, e.target.value, sortBy, sortOrder);
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
                  updateURL(statusFilter, newWarmup, search, sortBy, sortOrder);
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
                  updateURL(statusFilter, warmupFilter, search, newSort, sortOrder);
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
                  updateURL(statusFilter, warmupFilter, search, sortBy, newOrder);
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
          
          return (
            <Card 
              key={email.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "ring-2 ring-blue-500 bg-blue-50" : 
                email.status === "burned" ? "border-red-200 bg-red-50" :
                email.status === "warning" ? "border-yellow-200 bg-yellow-50" :
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
                          <StatusIcon status={email.status} />
                          {email.email}
                        </div>
                        <div className="text-xs text-gray-500">{email.name}</div>
                      </div>
                    </div>
                    
                    {/* Reply Rate Visual */}
                    <div className="bg-white rounded-lg p-3 mb-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">💬 Reply Rate</span>
                        <div className="flex items-center gap-1">
                          <AccountTrendIndicator trend={trend} />
                          {trend && trend.replyRates.length > 1 && (
                            <MiniSparkline data={trend.replyRates.map(r => r.rate)} />
                          )}
                        </div>
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
                  <th className="text-center p-4 font-medium text-sm text-gray-600">Status</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">
                    <button 
                      onClick={() => {
                        setSortBy("replyRate");
                        const newOrder = sortBy === "replyRate" ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
                        setSortOrder(newOrder);
                        updateURL(statusFilter, warmupFilter, search, "replyRate", newOrder);
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
                        updateURL(statusFilter, warmupFilter, search, "dailyLimit", newOrder);
                      }}
                      className="hover:text-gray-900 flex items-center gap-1 mx-auto"
                    >
                      🔥 Warmup Stage
                      {sortBy === "dailyLimit" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">📅 Days Active</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">📈 Trend</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">
                    <button 
                      onClick={() => {
                        setSortBy("totalSent");
                        const newOrder = sortBy === "totalSent" ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
                        setSortOrder(newOrder);
                        updateURL(statusFilter, warmupFilter, search, "totalSent", newOrder);
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
                  
                  return (
                    <tr 
                      key={email.id} 
                      className={`border-b cursor-pointer transition-all ${
                        isSelected ? "bg-blue-50" : 
                        email.status === "burned" ? "bg-red-50 hover:bg-red-100" :
                        email.status === "warning" ? "bg-yellow-50 hover:bg-yellow-100" :
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
                        <StatusIcon status={email.status} />
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
                          <AccountTrendIndicator trend={trend} />
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
              <span className="text-gray-600">email{selectedIds.size !== 1 ? "s" : ""} selected</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleEnableWarmup}
                disabled={bulkActionLoading !== null}
                className="bg-green-600 hover:bg-green-700"
              >
                {bulkActionLoading === "enable" ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enabling...
                  </>
                ) : (
                  "🔥 Enable Warmup"
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisableWarmup}
                disabled={bulkActionLoading !== null}
              >
                {bulkActionLoading === "disable" ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Disabling...
                  </>
                ) : (
                  "⏸️ Disable Warmup"
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSelected}
                disabled={bulkActionLoading !== null}
              >
                📥 Export CSV
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={bulkActionLoading !== null}
              >
                ✕ Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Loading fallback for Suspense
function EmailsPageLoading() {
  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📧 Email Accounts</h1>
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

// Wrapper component with Suspense boundary for useSearchParams
export default function EmailsPage() {
  return (
    <Suspense fallback={<EmailsPageLoading />}>
      <EmailsPageContent />
    </Suspense>
  );
}
