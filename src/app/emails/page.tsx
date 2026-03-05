"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getEmails, type EmailStatus, type WarmupStatus, type SenderEmail } from "@/lib/mock-data";
import { exportToCSV, EMAIL_ACCOUNTS_COLUMNS } from "@/lib/export-csv";

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
  } as SenderEmail & { warmupEnabled: boolean; totalSent: number; totalReplies: number };
}

// Extended type for display
type DisplayEmail = SenderEmail & { 
  warmupEnabled?: boolean; 
  totalSent?: number; 
  totalReplies?: number;
};

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
  const { data: emails, total, totalPages, filteredData } = useMemo(() => {
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
      // For mock data, get all filtered data for export
      const allFiltered = getEmails({
        page: 1,
        pageSize: 10000,
        search,
        status: statusFilter,
        warmupStatus: warmupFilter === "on" ? "ready" : warmupFilter === "off" ? "paused" : "all",
        sortBy: "replyRate",
        sortOrder: "asc",
      });
      return { ...result, filteredData: allFiltered.data };
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
    
    return { data, total, page, pageSize, totalPages, filteredData: filteredEmails };
  }, [apiEmails, page, pageSize, search, statusFilter, warmupFilter, sortBy, sortOrder]);

  // Export handler
  const handleExportCSV = useCallback(() => {
    // Prepare data for export - use filteredData (all filtered, not just current page)
    const exportData = filteredData.map((email: DisplayEmail) => ({
      email: email.email,
      name: email.name,
      domain: email.domain,
      status: email.status,
      warmupEnabled: email.warmupEnabled !== false && email.warmupStatus !== "paused" ? "ON" : "OFF",
      dailyLimit: email.dailyLimit,
      totalSent: email.totalSent || email.sentLast7Days,
      totalReplies: email.totalReplies || email.repliesLast7Days,
      replyRate: email.replyRate,
    }));
    
    exportToCSV(exportData, "email-accounts", EMAIL_ACCOUNTS_COLUMNS);
  }, [filteredData]);

  const getStatusBadge = (status: EmailStatus) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Healthy</Badge>;
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">Warning</Badge>;
      case "burned":
        return <Badge variant="destructive" className="text-xs">Burned</Badge>;
    }
  };

  const getWarmupBadge = (email: DisplayEmail) => {
    const isOn = email.warmupEnabled !== false && email.warmupStatus !== "paused";
    return isOn 
      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">ON</Badge>
      : <Badge variant="outline" className="text-gray-500 text-xs">OFF</Badge>;
  };

  const getReplyRateColor = (rate: number, hasSends: boolean) => {
    if (!hasSends) return "text-gray-400";
    if (rate < 1) return "text-red-600 font-semibold";
    if (rate < 2) return "text-yellow-600 font-medium";
    return "text-green-600 font-semibold";
  };

  const getDailyLimitDisplay = (limit: number) => {
    // Show warmup progress indicator based on limit
    // Typical progression: 5→10→20→35→50
    if (limit <= 5) return { text: `${limit}`, stage: "Start", color: "text-red-600" };
    if (limit <= 10) return { text: `${limit}`, stage: "Early", color: "text-orange-600" };
    if (limit <= 20) return { text: `${limit}`, stage: "Growing", color: "text-yellow-600" };
    if (limit <= 35) return { text: `${limit}`, stage: "Maturing", color: "text-blue-600" };
    return { text: `${limit}`, stage: "Ready", color: "text-green-600" };
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Email Accounts</h1>
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
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Email Accounts</h1>
          <p className="text-gray-500 mt-1 text-sm lg:text-base">
            Monitor warmup and reply rates for {summaryStats.total.toLocaleString()} sender emails
            {usingMockData && <span className="text-orange-500 ml-2">(Demo Mode)</span>}
          </p>
        </div>
        <Button 
          onClick={handleExportCSV}
          variant="outline"
          size="sm"
          disabled={total === 0}
          className="shrink-0"
        >
          Export CSV
        </Button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="col-span-1">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Warmup ON</div>
            <div className="text-2xl font-bold text-green-600">{summaryStats.warmupOn}</div>
            <div className="text-xs text-gray-400">{summaryStats.warmupOff} OFF</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Avg Reply Rate</div>
            <div className={`text-2xl font-bold ${getReplyRateColor(summaryStats.avgReplyRate, true)}`}>
              {summaryStats.avgReplyRate}%
            </div>
            <div className="text-xs text-gray-400">across all accounts</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">At Risk</div>
            <div className="text-2xl font-bold text-red-600">{summaryStats.atRisk}</div>
            <div className="text-xs text-gray-400">&lt;1% reply rate</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Performing</div>
            <div className="text-2xl font-bold text-green-600">{summaryStats.performing}</div>
            <div className="text-xs text-gray-400">&gt;2% reply rate</div>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Health Distribution</div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full flex">
                  <div 
                    className="bg-green-500 h-full" 
                    style={{ width: `${(filterCounts.healthy / filterCounts.all) * 100}%` }}
                  />
                  <div 
                    className="bg-yellow-500 h-full" 
                    style={{ width: `${(filterCounts.warning / filterCounts.all) * 100}%` }}
                  />
                  <div 
                    className="bg-red-500 h-full" 
                    style={{ width: `${(filterCounts.burned / filterCounts.all) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-green-600">{filterCounts.healthy}</span>
              <span className="text-yellow-600">{filterCounts.warning}</span>
              <span className="text-red-600">{filterCounts.burned}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleQuickFilter("all")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "all"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All ({filterCounts.all})
        </button>
        <button
          onClick={() => handleQuickFilter("burned")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "burned"
              ? "bg-red-600 text-white"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          🔴 At Risk ({filterCounts.burned})
        </button>
        <button
          onClick={() => handleQuickFilter("warning")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "warning"
              ? "bg-yellow-500 text-white"
              : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          }`}
        >
          🟡 Warning ({filterCounts.warning})
        </button>
        <button
          onClick={() => handleQuickFilter("healthy")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "healthy"
              ? "bg-green-600 text-white"
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
                placeholder="Search by email or name..."
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
                <option value="all">All Warmup</option>
                <option value="on">Warmup ON</option>
                <option value="off">Warmup OFF</option>
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
                <option value="replyRate">Sort: Reply Rate</option>
                <option value="dailyLimit">Sort: Daily Limit</option>
                <option value="totalSent">Sort: Total Sent</option>
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

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {(emails as DisplayEmail[]).map((email) => {
          const hasSends = (email.totalSent || email.sentLast7Days) > 0;
          const limitDisplay = getDailyLimitDisplay(email.dailyLimit);
          return (
            <Card key={email.id} className="cursor-pointer hover:bg-gray-50">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{email.email}</div>
                    <div className="text-xs text-gray-500">{email.name}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end ml-2">
                    {getWarmupBadge(email)}
                    {getStatusBadge(email.status)}
                  </div>
                </div>
                
                {/* Reply Rate Highlight */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Reply Rate</span>
                    <span className={`text-lg ${getReplyRateColor(email.replyRate, hasSends)}`}>
                      {hasSends ? `${email.replyRate}%` : "—"}
                    </span>
                  </div>
                  {hasSends && (
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2">
                      <div 
                        className={`h-full rounded-full ${
                          email.replyRate < 1 ? "bg-red-500" : 
                          email.replyRate < 2 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(email.replyRate * 25, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Daily Limit</div>
                    <div className={`font-medium ${limitDisplay.color}`}>
                      {limitDisplay.text}
                      <span className="text-xs text-gray-400 ml-1">{limitDisplay.stage}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Total Sent</div>
                    <div className="font-medium">{(email.totalSent || email.sentLast7Days).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Replies</div>
                    <div className="font-medium">{(email.totalReplies || email.repliesLast7Days).toLocaleString()}</div>
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
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Email</th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">Warmup</th>
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
                      Reply Rate
                      {sortBy === "replyRate" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-center p-4 font-medium text-sm text-gray-600">Status</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">
                    <button 
                      onClick={() => {
                        setSortBy("dailyLimit");
                        const newOrder = sortBy === "dailyLimit" ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
                        setSortOrder(newOrder);
                        updateURL(statusFilter, warmupFilter, search, "dailyLimit", newOrder);
                      }}
                      className="hover:text-gray-900 flex items-center gap-1 ml-auto"
                    >
                      Daily Limit
                      {sortBy === "dailyLimit" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
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
                      Total Sent
                      {sortBy === "totalSent" && (sortOrder === "asc" ? " ↑" : " ↓")}
                    </button>
                  </th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Replies</th>
                </tr>
              </thead>
              <tbody>
                {(emails as DisplayEmail[]).map((email) => {
                  const hasSends = (email.totalSent || email.sentLast7Days) > 0;
                  const limitDisplay = getDailyLimitDisplay(email.dailyLimit);
                  return (
                    <tr key={email.id} className="border-b cursor-pointer hover:bg-gray-50">
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{email.email}</div>
                          <div className="text-xs text-gray-500">{email.name}</div>
                        </div>
                      </td>
                      <td className="p-4 text-center">{getWarmupBadge(email)}</td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-lg ${getReplyRateColor(email.replyRate, hasSends)}`}>
                            {hasSends ? `${email.replyRate}%` : "—"}
                          </span>
                          {hasSends && (
                            <div className="w-16 h-1 bg-gray-200 rounded-full mt-1">
                              <div 
                                className={`h-full rounded-full ${
                                  email.replyRate < 1 ? "bg-red-500" : 
                                  email.replyRate < 2 ? "bg-yellow-500" : "bg-green-500"
                                }`}
                                style={{ width: `${Math.min(email.replyRate * 25, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">{getStatusBadge(email.status)}</td>
                      <td className="p-4 text-right">
                        <span className={limitDisplay.color}>{limitDisplay.text}</span>
                        <div className="text-xs text-gray-400">{limitDisplay.stage}</div>
                      </td>
                      <td className="p-4 text-right text-gray-600">
                        {(email.totalSent || email.sentLast7Days).toLocaleString()}
                      </td>
                      <td className="p-4 text-right text-gray-600">
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
            <span className="text-orange-600 ml-2">• Sorted by lowest reply rate (problem accounts first)</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Prev
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
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function EmailsPageLoading() {
  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Email Accounts</h1>
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
