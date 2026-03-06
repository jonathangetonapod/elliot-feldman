"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/info-tooltip";

// Raw Bison sender-emails response
interface BisonSenderEmail {
  id: number;
  email: string;
  name: string;
  status: string;
  warmup_enabled: boolean;
  warmup_limit: number;
  daily_limit: number;
  emails_sent_count?: number;
  total_replied_count?: number;
  unique_replied_count?: number;
  created_at: string;
}

// Warmup stats from the warmup API (last 7 days)
interface WarmupStats {
  warmupEmailsSent: number;
  warmupRepliesReceived: number;
  warmupReplyRate: number;
  warmupScore: number;
  warmupBounces: number;
  warmupSavedFromSpam: number;
}

type Verdict = "ready" | "on-track" | "needs-attention" | "no-data" | "paused" | "disconnected";

// Processed for display
interface WarmupAccount {
  id: number;
  email: string;
  name: string;
  domain: string;
  connected: boolean;
  warmupEnabled: boolean;
  dailyLimit: number;
  daysActive: number;
  createdAt: string;
  totalSent: number;
  totalReplies: number;
  warmupStats?: WarmupStats;
  verdict: Verdict;
  verdictReasons: string[];
}

function getDaysActive(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

const MIN_WARMUP_DAYS = 15;

// Determine verdict based on warmup stats + time connected
function getVerdict(
  wu: WarmupStats | undefined,
  connected: boolean,
  warmupEnabled: boolean,
  daysActive: number,
): { verdict: Verdict; reasons: string[] } {
  if (!connected) return { verdict: "disconnected", reasons: ["Account not connected to Bison"] };
  if (!warmupEnabled) return { verdict: "paused", reasons: ["Warmup is disabled"] };
  if (!wu || wu.warmupEmailsSent === 0) return { verdict: "no-data", reasons: ["No warmup activity yet"] };

  const reasons: string[] = [];
  let problems = 0;

  // Days check: 15+ days minimum
  if (daysActive >= MIN_WARMUP_DAYS) {
    reasons.push(`${daysActive} days warming (good)`);
  } else {
    reasons.push(`${daysActive} days warming (need ${MIN_WARMUP_DAYS})`);
    problems++;
  }

  // Score check: 90+ is good
  if (wu.warmupScore >= 90) {
    reasons.push(`Score ${wu.warmupScore} (good)`);
  } else if (wu.warmupScore >= 50) {
    reasons.push(`Score ${wu.warmupScore} (needs improvement)`);
  } else {
    reasons.push(`Score ${wu.warmupScore} (low)`);
    problems++;
  }

  // Reply rate check: 20%+ is good
  if (wu.warmupReplyRate >= 20) {
    reasons.push(`${wu.warmupReplyRate}% reply rate (good)`);
  } else if (wu.warmupReplyRate >= 10) {
    reasons.push(`${wu.warmupReplyRate}% reply rate (needs improvement)`);
  } else {
    reasons.push(`${wu.warmupReplyRate}% reply rate (low)`);
    problems++;
  }

  if (problems === 0 && daysActive >= MIN_WARMUP_DAYS && wu.warmupScore >= 90 && wu.warmupReplyRate >= 20) {
    return { verdict: "ready", reasons };
  } else if (problems >= 2) {
    return { verdict: "needs-attention", reasons };
  } else {
    return { verdict: "on-track", reasons };
  }
}

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; bg: string; border: string; badgeClass: string }> = {
  ready: {
    label: "Ready",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    badgeClass: "bg-green-600 text-white",
  },
  "on-track": {
    label: "On Track",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badgeClass: "bg-blue-600 text-white",
  },
  "needs-attention": {
    label: "Needs Attention",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    badgeClass: "bg-red-600 text-white",
  },
  "no-data": {
    label: "No Data",
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badgeClass: "bg-gray-400 text-white",
  },
  paused: {
    label: "Paused",
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badgeClass: "bg-gray-400 text-white",
  },
  disconnected: {
    label: "Disconnected",
    color: "text-gray-400",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badgeClass: "bg-gray-300 text-gray-600",
  },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function WarmupPage() {
  const [accounts, setAccounts] = useState<WarmupAccount[]>([]);
  const [loading, setLoading] = useState(true);

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

        if (!senderResponse.ok) throw new Error(`Sender API error: ${senderResponse.status}`);
        const senderData = await senderResponse.json();
        const emails = Array.isArray(senderData) ? senderData : (senderData.data || []);

        // Build warmup stats map by email
        const warmupMap = new Map<string, WarmupStats>();
        if (warmupResponse.ok) {
          const warmupData = await warmupResponse.json();
          const warmupEmails = Array.isArray(warmupData) ? warmupData : (warmupData.data || []);
          for (const wu of warmupEmails) {
            const sent = wu.warmup_emails_sent ?? 0;
            const replies = wu.warmup_replies_received ?? 0;
            warmupMap.set(wu.email.toLowerCase(), {
              warmupEmailsSent: sent,
              warmupRepliesReceived: replies,
              warmupReplyRate: sent > 0 ? Math.round((replies / sent) * 10000) / 100 : 0,
              warmupScore: wu.warmup_score ?? 0,
              warmupBounces: wu.warmup_bounces_received_count ?? 0,
              warmupSavedFromSpam: wu.warmup_emails_saved_from_spam ?? 0,
            });
          }
        }

        const transformed = emails.map((sender: BisonSenderEmail) => {
          const domain = sender.email.split("@")[1] || "unknown.com";
          const daysActive = getDaysActive(sender.created_at);
          const connected = sender.status?.toLowerCase() === "connected";
          const wu = warmupMap.get(sender.email.toLowerCase());
          const { verdict, reasons } = getVerdict(wu, connected, sender.warmup_enabled, daysActive);

          return {
            id: sender.id,
            email: sender.email,
            name: sender.name || sender.email.split("@")[0],
            domain,
            connected,
            warmupEnabled: sender.warmup_enabled,
            dailyLimit: sender.daily_limit,
            daysActive,
            createdAt: sender.created_at,
            totalSent: sender.emails_sent_count ?? 0,
            totalReplies: sender.unique_replied_count ?? sender.total_replied_count ?? 0,
            warmupStats: wu,
            verdict,
            verdictReasons: reasons,
          } as WarmupAccount;
        });

        setAccounts(transformed);
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const groups = useMemo(() => {
    const ready = accounts.filter(a => a.verdict === "ready").sort((a, b) => b.daysActive - a.daysActive);
    const onTrack = accounts.filter(a => a.verdict === "on-track").sort((a, b) => b.daysActive - a.daysActive);
    const needsAttention = accounts.filter(a => a.verdict === "needs-attention").sort((a, b) => a.warmupStats?.warmupScore ?? 0 - (b.warmupStats?.warmupScore ?? 0));
    const noData = accounts.filter(a => a.verdict === "no-data").sort((a, b) => b.daysActive - a.daysActive);
    const inactive = accounts.filter(a => a.verdict === "paused" || a.verdict === "disconnected");

    // Compute days warming stats for active accounts
    const activeAccounts = [...ready, ...onTrack, ...needsAttention];
    const avgDays = activeAccounts.length > 0
      ? Math.round(activeAccounts.reduce((sum, a) => sum + a.daysActive, 0) / activeAccounts.length)
      : 0;
    const minDays = activeAccounts.length > 0 ? Math.min(...activeAccounts.map(a => a.daysActive)) : 0;
    const maxDays = activeAccounts.length > 0 ? Math.max(...activeAccounts.map(a => a.daysActive)) : 0;

    return { ready, onTrack, needsAttention, noData, inactive, total: accounts.length, avgDays, minDays, maxDays };
  }, [accounts]);

  function MetricPill({ label, value, target, pass }: { label: string; value: string; target: string; pass: boolean | "warn" }) {
    const color = pass === true
      ? "text-green-700 bg-green-100 border-green-200"
      : pass === "warn"
        ? "text-yellow-700 bg-yellow-100 border-yellow-200"
        : "text-red-700 bg-red-100 border-red-200";
    return (
      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap border ${color}`}>
        {label} <span className="font-bold">{value}</span>
        {pass !== true && <span className="opacity-60"> / {target}</span>}
      </span>
    );
  }

  function AccountRow({ account }: { account: WarmupAccount }) {
    const config = VERDICT_CONFIG[account.verdict];
    const wu = account.warmupStats;
    const hasSends = wu && wu.warmupEmailsSent > 0;

    // Determine pass/fail for each metric
    const daysPass = account.daysActive >= MIN_WARMUP_DAYS ? true : false;
    const scorePass = hasSends ? (wu.warmupScore >= 90 ? true : wu.warmupScore >= 50 ? "warn" as const : false) : null;
    const replyPass = hasSends ? (wu.warmupReplyRate >= 20 ? true : wu.warmupReplyRate >= 10 ? "warn" as const : false) : null;

    // Days warming context
    const days = account.daysActive;
    const daysLabel = days < 7 ? "< 1 week" : days < 14 ? "~1 week" : days < 30 ? `${Math.floor(days / 7)} weeks` : `${Math.floor(days / 30)}mo ${days % 30}d`;

    return (
      <div className={`flex items-center justify-between p-3 rounded-lg ${config.bg} border ${config.border}`}>
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {/* Days warming - prominent */}
          <div className="text-center flex-shrink-0 w-14">
            <div className="text-lg font-bold text-gray-900 leading-tight">{days}</div>
            <div className="text-[10px] text-gray-400 leading-tight">days</div>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{account.email}</div>
            <div className="text-xs text-gray-500">
              {daysLabel} warming · Since {formatDate(account.createdAt)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-3">
          {hasSends ? (
            <>
              {!daysPass && (
                <MetricPill label="Days" value={`${account.daysActive}`} target={`${MIN_WARMUP_DAYS}`} pass={false} />
              )}
              <MetricPill label="Score" value={String(wu.warmupScore)} target="90" pass={scorePass!} />
              <MetricPill label="Reply" value={`${wu.warmupReplyRate}%`} target="20%" pass={replyPass!} />
            </>
          ) : (
            <span className="text-xs text-gray-400">{account.verdictReasons[0]}</span>
          )}
          <Badge className={`text-xs ${config.badgeClass}`}>{config.label}</Badge>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Warmup Status</h1>
          <p className="text-gray-500 mt-1 text-sm">Checking warmup health across all accounts...</p>
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
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Warmup Status</h1>
        <p className="text-gray-500 mt-1 text-sm">
          An account is ready when it hits all three benchmarks. Stats from last 7 days.
        </p>
        {/* Benchmarks bar */}
        <div className="flex flex-wrap items-center gap-3 mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Benchmarks:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">Score <span className="font-semibold">90+</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">Reply Rate <span className="font-semibold">20%+</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">Days Warming <span className="font-semibold">15+</span></span>
          </div>
          <span className="text-xs text-gray-400 ml-auto">All three = Ready to Go Live</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="border-2 border-gray-300">
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-gray-900">{groups.avgDays}<span className="text-base font-normal text-gray-400">d</span></div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              Avg. Days Warming
              <InfoTooltip text={`Range: ${groups.minDays}d – ${groups.maxDays}d across ${groups.ready.length + groups.onTrack.length + groups.needsAttention.length} active accounts.`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-green-600">{groups.ready.length}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              Ready to Go Live
              <InfoTooltip text="Score 90+, reply rate 20%+, low bounces. These accounts have healthy warmup and can be used for campaigns." />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">{groups.onTrack.length}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              On Track
              <InfoTooltip text="Warmup is progressing but not all thresholds are met yet. Keep warming — don't use for campaigns yet." />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-red-600">{groups.needsAttention.length}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              Needs Attention
              <InfoTooltip text="Two or more metrics are bad (low score, low reply rate, or high bounces). Investigate these accounts." />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 px-4 pb-4">
            <div className="text-2xl font-bold text-gray-400">{groups.noData.length + groups.inactive.length}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              No Data / Off
              <InfoTooltip text={`${groups.noData.length} with no warmup activity, ${groups.inactive.length} paused or disconnected.`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ready to Go Live */}
      {groups.ready.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-green-700">Ready to Go Live ({groups.ready.length})</h2>
            <InfoTooltip text="All three metrics are healthy. These accounts can start sending campaigns." />
          </div>
          <div className="grid gap-2">
            {groups.ready.map(account => <AccountRow key={account.id} account={account} />)}
          </div>
        </div>
      )}

      {/* On Track */}
      {groups.onTrack.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-blue-700">On Track ({groups.onTrack.length})</h2>
            <InfoTooltip text="Warmup is progressing but one metric needs improvement. Keep warming — don't use for campaigns yet." />
          </div>
          <div className="grid gap-2">
            {groups.onTrack.map(account => <AccountRow key={account.id} account={account} />)}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {groups.needsAttention.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-red-700">Needs Attention ({groups.needsAttention.length})</h2>
            <InfoTooltip text="Two or more warmup metrics are bad. These accounts may have deliverability issues — investigate before using." />
          </div>
          <div className="grid gap-2">
            {groups.needsAttention.map(account => <AccountRow key={account.id} account={account} />)}
          </div>
        </div>
      )}

      {/* No Data */}
      {groups.noData.length > 0 && (
        <div className="mb-6">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-500">No Warmup Data ({groups.noData.length})</h2>
                <InfoTooltip text="Connected with warmup enabled, but no warmup sends recorded in the last 7 days." />
                <span className="text-gray-400 text-xs">click to expand</span>
              </div>
            </summary>
            <div className="grid gap-2">
              {groups.noData.map(account => <AccountRow key={account.id} account={account} />)}
            </div>
          </details>
        </div>
      )}

      {/* Paused / Disconnected */}
      {groups.inactive.length > 0 && (
        <div className="mb-6">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-500">Paused & Disconnected ({groups.inactive.length})</h2>
                <InfoTooltip text="These accounts are not building warmup reputation." />
                <span className="text-gray-400 text-xs">click to expand</span>
              </div>
            </summary>
            <div className="grid gap-2">
              {groups.inactive.map(account => <AccountRow key={account.id} account={account} />)}
            </div>
          </details>
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No sender accounts found. Add accounts in Bison to get started.
        </div>
      )}
    </div>
  );
}
