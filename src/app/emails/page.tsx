"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getEmails, type EmailStatus, type WarmupStatus, type SenderEmail } from "@/lib/mock-data";

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
  
  // Determine warmup status
  let warmupStatus: WarmupStatus;
  if (!bisonEmail.warmup_enabled) {
    warmupStatus = "paused";
  } else if (warmupDay >= 30 || bisonEmail.daily_limit >= 40) {
    warmupStatus = "ready";
  } else {
    warmupStatus = "warming";
  }
  
  // Calculate warmup ready date
  const warmupReadyDate = new Date(createdAt);
  warmupReadyDate.setDate(warmupReadyDate.getDate() + 30);
  
  // Simulate reply rate based on connection status and warmup progress
  // In a real scenario, this would come from campaign analytics
  let replyRate: number;
  if (bisonEmail.status === "disconnected") {
    replyRate = 0;
  } else if (warmupStatus === "warming") {
    // Lower reply rate during warmup (0.5-1.5%)
    replyRate = 0.5 + (warmupDay / 30) * 1;
  } else {
    // Healthy emails get 1.5-4% reply rate (simulated)
    replyRate = 1.5 + (Math.abs(hashCode(bisonEmail.email)) % 250) / 100;
  }
  
  // Determine health status based on reply rate
  let status: EmailStatus;
  if (bisonEmail.status === "disconnected") {
    status = "burned";
  } else if (replyRate >= 2) {
    status = "healthy";
  } else if (replyRate >= 1) {
    status = "warning";
  } else {
    status = "burned";
  }
  
  // Calculate 7-day stats from available data
  // Use emails_sent_count (total) if available, otherwise fallback to daily * 7
  const sentLast7Days = bisonEmail.emails_sent_count ?? 
    (bisonEmail.emails_sent_today ? bisonEmail.emails_sent_today * 7 : 0);
  const repliesLast7Days = Math.round(sentLast7Days * (replyRate / 100));
  
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
    sentLast7Days,
    repliesLast7Days,
    lastSyncedAt: new Date().toISOString(),
  };
}

// Simple hash function for consistent pseudo-random values
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

export default function EmailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize state from URL params
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<EmailStatus | "all">(
    (searchParams.get("status") as EmailStatus | "all") || "all"
  );
  const [warmupFilter, setWarmupFilter] = useState<WarmupStatus | "all">(
    (searchParams.get("warmup") as WarmupStatus | "all") || "all"
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [apiEmails, setApiEmails] = useState<SenderEmail[] | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const pageSize = 25;

  // Update URL when filters change
  const updateURL = useCallback((newStatus: EmailStatus | "all", newWarmup: WarmupStatus | "all", newSearch: string) => {
    const params = new URLSearchParams();
    if (newStatus !== "all") params.set("status", newStatus);
    if (newWarmup !== "all") params.set("warmup", newWarmup);
    if (newSearch) params.set("search", newSearch);
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

  // Calculate counts for quick filters (before filtering)
  const filterCounts = useMemo(() => {
    const allEmails = apiEmails || getEmails({ page: 1, pageSize: 10000 }).data;
    return {
      all: allEmails.length,
      burned: allEmails.filter(e => e.status === "burned").length,
      warning: allEmails.filter(e => e.status === "warning").length,
      warming: allEmails.filter(e => e.warmupStatus === "warming").length,
      ready: allEmails.filter(e => e.warmupStatus === "ready").length,
    };
  }, [apiEmails]);

  // Quick filter handlers
  const handleQuickFilter = (type: "all" | "burned" | "warning" | "warming" | "ready") => {
    let newStatus: EmailStatus | "all" = "all";
    let newWarmup: WarmupStatus | "all" = "all";
    
    if (type === "burned") {
      newStatus = "burned";
    } else if (type === "warning") {
      newStatus = "warning";
    } else if (type === "warming") {
      newWarmup = "warming";
    } else if (type === "ready") {
      newWarmup = "ready";
    }
    
    setStatusFilter(newStatus);
    setWarmupFilter(newWarmup);
    setPage(1);
    updateURL(newStatus, newWarmup, search);
  };

  // Check which quick filter is active
  const activeQuickFilter = useMemo(() => {
    if (statusFilter === "burned") return "burned";
    if (statusFilter === "warning") return "warning";
    if (warmupFilter === "warming") return "warming";
    if (warmupFilter === "ready") return "ready";
    if (statusFilter === "all" && warmupFilter === "all") return "all";
    return null;
  }, [statusFilter, warmupFilter]);

  // Filter and paginate emails
  const { data: emails, total, totalPages } = useMemo(() => {
    // Use mock data if API data not available
    if (apiEmails === null) {
      return getEmails({
        page,
        pageSize,
        search,
        status: statusFilter,
        warmupStatus: warmupFilter,
        sortBy: "replyRate",
        sortOrder: "asc",
      });
    }
    
    // Filter API data locally
    let filteredEmails = [...apiEmails];
    
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
    
    // Warmup filter
    if (warmupFilter !== "all") {
      filteredEmails = filteredEmails.filter((e) => e.warmupStatus === warmupFilter);
    }
    
    // Sort by reply rate (ascending - worst first)
    filteredEmails.sort((a, b) => a.replyRate - b.replyRate);
    
    const total = filteredEmails.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = filteredEmails.slice(start, start + pageSize);
    
    return { data, total, page, pageSize, totalPages };
  }, [apiEmails, page, pageSize, search, statusFilter, warmupFilter]);

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

  const getWarmupBadge = (status: WarmupStatus, day: number) => {
    switch (status) {
      case "ready":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Ready</Badge>;
      case "warming":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">Day {day}/30</Badge>;
      case "paused":
        return <Badge variant="outline" className="text-xs">Paused</Badge>;
    }
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
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Email Accounts</h1>
        <p className="text-gray-500 mt-1 text-sm lg:text-base">
          Monitor and manage {total.toLocaleString()} sender emails
          {usingMockData && <span className="text-orange-500 ml-2">(Demo Mode)</span>}
        </p>
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
          🔴 Burned ({filterCounts.burned})
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
          onClick={() => handleQuickFilter("warming")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "warming"
              ? "bg-orange-500 text-white"
              : "bg-orange-100 text-orange-700 hover:bg-orange-200"
          }`}
        >
          🔥 Warming ({filterCounts.warming})
        </button>
        <button
          onClick={() => handleQuickFilter("ready")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeQuickFilter === "ready"
              ? "bg-green-600 text-white"
              : "bg-green-100 text-green-700 hover:bg-green-200"
          }`}
        >
          ✅ Ready ({filterCounts.ready})
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
                  updateURL(statusFilter, warmupFilter, e.target.value);
                }}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={statusFilter}
                onChange={(e) => {
                  const newStatus = e.target.value as EmailStatus | "all";
                  setStatusFilter(newStatus);
                  setPage(1);
                  updateURL(newStatus, warmupFilter, search);
                }}
              >
                <option value="all">All Status</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="burned">Burned</option>
              </select>
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={warmupFilter}
                onChange={(e) => {
                  const newWarmup = e.target.value as WarmupStatus | "all";
                  setWarmupFilter(newWarmup);
                  setPage(1);
                  updateURL(statusFilter, newWarmup, search);
                }}
              >
                <option value="all">All Warmup</option>
                <option value="ready">Ready</option>
                <option value="warming">Warming</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {emails.map((email) => (
          <Card key={email.id} className="cursor-pointer hover:bg-gray-50">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{email.email}</div>
                  <div className="text-xs text-gray-500">{email.name}</div>
                </div>
                <div className="flex flex-col gap-1 items-end ml-2">
                  {getStatusBadge(email.status)}
                  {getWarmupBadge(email.warmupStatus, email.warmupDay)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t">
                <div>
                  <div className="text-gray-500">Reply Rate</div>
                  <div className={`font-medium ${
                    email.replyRate < 1 ? "text-red-600" :
                    email.replyRate < 2 ? "text-yellow-600" : "text-green-600"
                  }`}>
                    {email.replyRate}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Sent (7d)</div>
                  <div className="font-medium">{email.sentLast7Days}</div>
                </div>
                <div>
                  <div className="text-gray-500">Daily Limit</div>
                  <div className="font-medium">{email.dailyLimit}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Email</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Domain</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Status</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Warmup</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Reply Rate</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Sent (7d)</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Daily Limit</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id} className="border-b cursor-pointer hover:bg-gray-50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{email.email}</div>
                        <div className="text-xs text-gray-500">{email.name}</div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{email.domain}</td>
                    <td className="p-4">{getStatusBadge(email.status)}</td>
                    <td className="p-4">{getWarmupBadge(email.warmupStatus, email.warmupDay)}</td>
                    <td className="p-4 text-right">
                      <span className={
                        email.replyRate < 1 ? "text-red-600 font-medium" :
                        email.replyRate < 2 ? "text-yellow-600" : "text-green-600"
                      }>
                        {email.replyRate}%
                      </span>
                    </td>
                    <td className="p-4 text-right text-gray-600">{email.sentLast7Days}</td>
                    <td className="p-4 text-right text-gray-600">{email.dailyLimit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
        <div className="text-xs lg:text-sm text-gray-500">
          Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total.toLocaleString()}
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
