"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/info-tooltip";

interface BisonSenderEmail {
  id: number;
  email: string;
  name: string;
  status: string;
  warmup_enabled: boolean;
  daily_limit: number;
  emails_sent_count?: number;
  total_replied_count?: number;
  unique_replied_count?: number;
  bounced_count?: number;
  created_at: string;
}

interface WarmupStatsRaw {
  email: string;
  warmup_score?: number;
  warmup_emails_sent?: number;
  warmup_replies_received?: number;
  warmup_bounces_received_count?: number;
}

interface DomainData {
  domain: string;
  accounts: number;
  connected: number;
  disconnected: number;
  warmupEnabled: number;
  avgDaysActive: number;
  totalSent: number;
  totalReplies: number;
  totalBounced: number;
  avgWarmupScore: number | null;
  warmupAccountsWithData: number;
  readyAccounts: number;
  oldestAccount: string;
  newestAccount: string;
}

function getDaysActive(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const endDate = now.toISOString().split("T")[0];
        const startDate = weekAgo.toISOString().split("T")[0];

        const [senderResponse, warmupResponse] = await Promise.all([
          fetch("/api/bison?endpoint=sender-emails"),
          fetch(`/api/bison/warmup?start_date=${startDate}&end_date=${endDate}`),
        ]);

        if (!senderResponse.ok) throw new Error(`API error: ${senderResponse.status}`);
        const senderData = await senderResponse.json();
        const emails: BisonSenderEmail[] = Array.isArray(senderData) ? senderData : (senderData.data || []);

        // Build warmup score map
        const warmupMap = new Map<string, WarmupStatsRaw>();
        if (warmupResponse.ok) {
          const warmupData = await warmupResponse.json();
          const warmupEmails = Array.isArray(warmupData) ? warmupData : (warmupData.data || []);
          for (const wu of warmupEmails) {
            warmupMap.set(wu.email.toLowerCase(), wu);
          }
        }

        // Group by domain
        const domainMap = new Map<string, BisonSenderEmail[]>();
        for (const email of emails) {
          const domain = email.email.split("@")[1]?.toLowerCase() || "unknown";
          if (!domainMap.has(domain)) domainMap.set(domain, []);
          domainMap.get(domain)!.push(email);
        }

        // Build domain stats
        const domainList: DomainData[] = [];
        for (const [domain, accounts] of domainMap) {
          const connected = accounts.filter(a => a.status?.toLowerCase() === "connected").length;
          const warmupEnabled = accounts.filter(a => a.warmup_enabled).length;
          const daysActiveList = accounts.map(a => getDaysActive(a.created_at));
          const avgDays = Math.round(daysActiveList.reduce((s, d) => s + d, 0) / daysActiveList.length);

          // Warmup scores for this domain
          const warmupScores: number[] = [];
          let readyCount = 0;
          for (const acct of accounts) {
            const wu = warmupMap.get(acct.email.toLowerCase());
            if (wu && wu.warmup_score != null && (wu.warmup_emails_sent ?? 0) > 0) {
              warmupScores.push(wu.warmup_score);
              const days = getDaysActive(acct.created_at);
              if (wu.warmup_score >= 90 && days >= 15) readyCount++;
            }
          }

          const avgScore = warmupScores.length > 0
            ? Math.round(warmupScores.reduce((s, v) => s + v, 0) / warmupScores.length * 100) / 100
            : null;

          const createdDates = accounts.map(a => new Date(a.created_at).getTime());

          domainList.push({
            domain,
            accounts: accounts.length,
            connected,
            disconnected: accounts.length - connected,
            warmupEnabled,
            avgDaysActive: avgDays,
            totalSent: accounts.reduce((s, a) => s + (a.emails_sent_count ?? 0), 0),
            totalReplies: accounts.reduce((s, a) => s + (a.unique_replied_count ?? a.total_replied_count ?? 0), 0),
            totalBounced: accounts.reduce((s, a) => s + (a.bounced_count ?? 0), 0),
            avgWarmupScore: avgScore,
            warmupAccountsWithData: warmupScores.length,
            readyAccounts: readyCount,
            oldestAccount: new Date(Math.min(...createdDates)).toISOString(),
            newestAccount: new Date(Math.max(...createdDates)).toISOString(),
          });
        }

        // Sort by number of accounts descending
        domainList.sort((a, b) => b.accounts - a.accounts);
        setDomains(domainList);
      } catch (error) {
        console.error("Failed to fetch domain data:", error);
        setDomains([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return domains;
    return domains.filter(d => d.domain.toLowerCase().includes(search.toLowerCase()));
  }, [domains, search]);

  const stats = useMemo(() => {
    const total = domains.length;
    const totalAccounts = domains.reduce((s, d) => s + d.accounts, 0);
    const totalReady = domains.reduce((s, d) => s + d.readyAccounts, 0);
    const avgScore = domains.filter(d => d.avgWarmupScore !== null);
    const overallAvgScore = avgScore.length > 0
      ? Math.round(avgScore.reduce((s, d) => s + d.avgWarmupScore!, 0) / avgScore.length * 100) / 100
      : null;
    return { total, totalAccounts, totalReady, overallAvgScore };
  }, [domains]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Domain Health</h1>
          <p className="text-gray-500 mt-1 text-sm">Loading domain data from accounts...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Domain Health</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Domain-level view of your sending accounts. Aggregated from Bison sender emails.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">Domains</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-gray-900">{stats.totalAccounts}</div>
            <div className="text-xs text-gray-500">Total Accounts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-green-600">{stats.totalReady}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              Ready Accounts
              <InfoTooltip text="Accounts with warmup score 90+ and 15+ days warming." />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">{stats.overallAvgScore ?? "—"}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              Avg. Warmup Score
              <InfoTooltip text="Average warmup score across all domains with warmup data." />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search domains..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm max-w-md"
        />
      </div>

      {/* Domain list */}
      <div className="grid gap-3">
        {filtered.map(domain => {
          const allReady = domain.readyAccounts === domain.warmupAccountsWithData && domain.warmupAccountsWithData > 0;
          const hasDisconnected = domain.disconnected > 0;
          const scoreColor = domain.avgWarmupScore === null ? "text-gray-400"
            : domain.avgWarmupScore >= 90 ? "text-green-600"
            : domain.avgWarmupScore >= 50 ? "text-yellow-600"
            : "text-red-600";

          return (
            <Card key={domain.domain}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{domain.domain}</span>
                      {allReady && <Badge className="bg-green-600 text-white text-[10px]">All Ready</Badge>}
                      {hasDisconnected && <Badge variant="outline" className="text-[10px] text-gray-400">{domain.disconnected} disconnected</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {domain.accounts} account{domain.accounts !== 1 ? "s" : ""} · {domain.connected} connected · {domain.avgDaysActive}d avg. warming · Since {formatDate(domain.oldestAccount)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Warmup score */}
                    <div className="text-center">
                      <div className={`text-sm font-bold ${scoreColor}`}>
                        {domain.avgWarmupScore ?? "—"}
                      </div>
                      <div className="text-[10px] text-gray-400">Score</div>
                    </div>

                    {/* Ready / total */}
                    <div className="text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {domain.readyAccounts}<span className="text-gray-400 font-normal">/{domain.accounts}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">Ready</div>
                    </div>

                    {/* Campaign stats */}
                    {domain.totalSent > 0 && (
                      <div className="text-center">
                        <div className="text-sm font-bold text-gray-700">{domain.totalSent.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400">Sent</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          {search ? "No domains match your search." : "No domains found."}
        </div>
      )}
    </div>
  );
}
