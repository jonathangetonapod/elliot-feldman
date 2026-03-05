"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockDashboardStats, generateMockEmails } from "@/lib/mock-data";
import { useBisonData } from "@/lib/use-bison-data";
import { useState, useEffect, useMemo } from "react";
import {
  fetchWarmupStats,
  type WarmupAccountComparison,
  type WarmupPeriodType,
} from "@/lib/bison-api";
import Link from "next/link";

// ==========================================
// SIMPLIFIED ACCOUNTS PAGE
// Goal: "Which accounts do I need to deal with TODAY?"
// ==========================================

interface AccountWithRisk {
  id: number;
  email: string;
  currentReplyRate: number;
  baselineReplyRate: number;
  percentDrop: number;
  status: 'action' | 'watch' | 'healthy';
}

// Categorize accounts by reply rate drop
function categorizeAccounts(warmupData: WarmupAccountComparison[]): {
  needsAction: AccountWithRisk[];
  watchList: AccountWithRisk[];
  healthy: AccountWithRisk[];
} {
  const needsAction: AccountWithRisk[] = [];
  const watchList: AccountWithRisk[] = [];
  const healthy: AccountWithRisk[] = [];

  for (const account of warmupData) {
    const currentRate = account.current.warmup_reply_rate ?? 0;
    const baselineRate = account.baseline?.warmup_reply_rate ?? currentRate;
    const change = account.changes.warmup_reply_rate ?? 0;

    const accountData: AccountWithRisk = {
      id: account.id,
      email: account.email,
      currentReplyRate: Math.round(currentRate * 10) / 10,
      baselineReplyRate: Math.round(baselineRate * 10) / 10,
      percentDrop: Math.round(Math.abs(change)),
      status: 'healthy',
    };

    // 🔥 Needs Action: Reply rate dropped >30%
    if (change <= -30) {
      accountData.status = 'action';
      needsAction.push(accountData);
    }
    // ⚠️ Watch List: Reply rate dropped 10-30%
    else if (change <= -10) {
      accountData.status = 'watch';
      watchList.push(accountData);
    }
    // ✅ Healthy: Everything else
    else {
      accountData.status = 'healthy';
      healthy.push(accountData);
    }
  }

  // Sort by severity (biggest drop first)
  needsAction.sort((a, b) => b.percentDrop - a.percentDrop);
  watchList.sort((a, b) => b.percentDrop - a.percentDrop);
  healthy.sort((a, b) => b.currentReplyRate - a.currentReplyRate);

  return { needsAction, watchList, healthy };
}

// Account Card Component - Simple and scannable
function AccountCard({ account, onView }: { account: AccountWithRisk; onView: () => void }) {
  const statusConfig = {
    action: { emoji: '🔥', bg: 'bg-red-50 hover:bg-red-100', border: 'border-red-200', text: 'text-red-700' },
    watch: { emoji: '⚠️', bg: 'bg-yellow-50 hover:bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-700' },
    healthy: { emoji: '✅', bg: 'bg-green-50 hover:bg-green-100', border: 'border-green-200', text: 'text-green-700' },
  };

  const config = statusConfig[account.status];

  return (
    <div
      onClick={onView}
      className={`p-4 rounded-lg border ${config.bg} ${config.border} cursor-pointer transition-all active:scale-[0.98]`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Email + Status */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xl shrink-0">{config.emoji}</span>
          <span className="font-medium text-gray-900 truncate">{account.email}</span>
        </div>

        {/* Reply Rate Change */}
        <div className="text-right shrink-0">
          <div className={`text-sm font-bold ${config.text}`}>
            {account.status !== 'healthy' ? (
              <>Was {account.baselineReplyRate}% → Now {account.currentReplyRate}%</>
            ) : (
              <>{account.currentReplyRate}%</>
            )}
          </div>
          {account.status !== 'healthy' && (
            <div className={`text-xs ${config.text}`}>
              ↓{account.percentDrop}% drop
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Section Component
function AccountSection({
  title,
  emoji,
  subtitle,
  accounts,
  bgColor,
  textColor,
  borderColor,
  defaultCollapsed = false,
  onViewAccount,
}: {
  title: string;
  emoji: string;
  subtitle: string;
  accounts: AccountWithRisk[];
  bgColor: string;
  textColor: string;
  borderColor: string;
  defaultCollapsed?: boolean;
  onViewAccount: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (accounts.length === 0) return null;

  return (
    <div className={`rounded-xl border-2 ${borderColor} overflow-hidden`}>
      {/* Header - Always visible */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full ${bgColor} p-4 flex items-center justify-between`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div className="text-left">
            <h2 className={`text-lg font-bold ${textColor}`}>{title}</h2>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${bgColor} ${textColor} border ${borderColor} text-lg px-3 py-1`}>
            {accounts.length}
          </Badge>
          <span className="text-gray-400 text-xl">
            {collapsed ? '▶' : '▼'}
          </span>
        </div>
      </button>

      {/* Account List */}
      {!collapsed && (
        <div className="p-4 space-y-2 bg-white">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onView={() => onViewAccount(account.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { emails: bisonEmails, loading, error, connected, lastFetched, refetch } = useBisonData();

  // Time period state
  const [timePeriod, setTimePeriod] = useState<7 | 14 | 30>(7);
  
  // Warmup stats from Bison API
  const [warmupData, setWarmupData] = useState<WarmupAccountComparison[]>([]);
  const [warmupLoading, setWarmupLoading] = useState(false);

  // Fetch warmup stats when period changes
  useEffect(() => {
    async function fetchWarmup() {
      setWarmupLoading(true);
      try {
        const periodMap: Record<7 | 14 | 30, WarmupPeriodType> = {
          7: '7vs7',
          14: '14vs14',
          30: '30vs30',
        };
        const response = await fetchWarmupStats(periodMap[timePeriod], true);
        if (response.data) {
          setWarmupData(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch warmup stats:', err);
      } finally {
        setWarmupLoading(false);
      }
    }
    fetchWarmup();
  }, [timePeriod]);

  // Categorize accounts
  const { needsAction, watchList, healthy } = useMemo(() => {
    if (warmupData.length === 0) {
      // Generate mock data for demo
      const mockEmails = bisonEmails.length > 0 ? bisonEmails : generateMockEmails();
      const mockAccounts: AccountWithRisk[] = mockEmails.map((email, idx) => {
        // Simulate some variance for demo
        const baseRate = email.replyRate || 2;
        const drop = idx < 3 ? 40 : idx < 8 ? 20 : 5;
        const current = Math.max(0.1, baseRate - (baseRate * drop / 100));
        
        return {
          id: email.id,
          email: email.email,
          currentReplyRate: Math.round(current * 10) / 10,
          baselineReplyRate: Math.round(baseRate * 10) / 10,
          percentDrop: drop,
          status: drop > 30 ? 'action' : drop > 10 ? 'watch' : 'healthy',
        } as AccountWithRisk;
      });

      return {
        needsAction: mockAccounts.filter(a => a.status === 'action'),
        watchList: mockAccounts.filter(a => a.status === 'watch'),
        healthy: mockAccounts.filter(a => a.status === 'healthy'),
      };
    }

    return categorizeAccounts(warmupData);
  }, [warmupData, bisonEmails]);

  // Handle view account
  const handleViewAccount = (id: number) => {
    window.location.href = `/emails?search=${encodeURIComponent(
      warmupData.find(a => a.id === id)?.email || 
      bisonEmails.find(e => e.id === id)?.email || ''
    )}`;
  };

  const isLoading = loading || warmupLoading;
  const useMockData = !connected || error || warmupData.length === 0;

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Accounts</h1>
          
          {/* Connection Status */}
          {useMockData ? (
            <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700">
              <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5"></span>
              Demo Mode
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-green-200 text-green-700">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
              Live Data
            </Badge>
          )}
        </div>
        <p className="text-gray-500 text-sm">Which accounts need attention today?</p>
      </div>

      {/* Top Summary - 3 Numbers */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 text-center">
            <div className="text-3xl lg:text-4xl font-black text-red-600">
              {needsAction.length}
            </div>
            <div className="text-xs lg:text-sm text-red-600 font-medium mt-1">
              🔥 Need Action
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 text-center">
            <div className="text-3xl lg:text-4xl font-black text-yellow-600">
              {watchList.length}
            </div>
            <div className="text-xs lg:text-sm text-yellow-600 font-medium mt-1">
              ⚠️ Watch
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 text-center">
            <div className="text-3xl lg:text-4xl font-black text-green-600">
              {healthy.length}
            </div>
            <div className="text-xs lg:text-sm text-green-600 font-medium mt-1">
              ✅ Healthy
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Period Selector */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-sm text-gray-600">Comparing reply rates over:</span>
        <div className="flex gap-2">
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => setTimePeriod(days as 7 | 14 | 30)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timePeriod === days
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading accounts...</p>
        </div>
      )}

      {/* Account Sections */}
      {!isLoading && (
        <div className="space-y-4">
          {/* 🔥 Needs Action - RED */}
          <AccountSection
            title="Needs Action"
            emoji="🔥"
            subtitle="Reply rate dropped >30% — these accounts need attention"
            accounts={needsAction}
            bgColor="bg-red-100"
            textColor="text-red-700"
            borderColor="border-red-300"
            onViewAccount={handleViewAccount}
          />

          {/* ⚠️ Watch List - YELLOW */}
          <AccountSection
            title="Watch List"
            emoji="⚠️"
            subtitle="Reply rate dropped 10-30% — keep an eye on these"
            accounts={watchList}
            bgColor="bg-yellow-100"
            textColor="text-yellow-700"
            borderColor="border-yellow-300"
            onViewAccount={handleViewAccount}
          />

          {/* ✅ Healthy - GREEN (collapsed by default) */}
          <AccountSection
            title="Healthy"
            emoji="✅"
            subtitle="These accounts are performing well"
            accounts={healthy}
            bgColor="bg-green-100"
            textColor="text-green-700"
            borderColor="border-green-300"
            defaultCollapsed={true}
            onViewAccount={handleViewAccount}
          />

          {/* Empty State */}
          {needsAction.length === 0 && watchList.length === 0 && healthy.length === 0 && (
            <Card className="bg-gray-50">
              <CardContent className="p-8 text-center">
                <span className="text-4xl block mb-4">📭</span>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts found</h3>
                <p className="text-gray-500 text-sm">
                  Connect your email accounts to start monitoring their health.
                </p>
              </CardContent>
            </Card>
          )}

          {/* All Clear Message */}
          {needsAction.length === 0 && watchList.length === 0 && healthy.length > 0 && (
            <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
              <CardContent className="p-6 text-center">
                <span className="text-4xl block mb-2">🎉</span>
                <h3 className="text-lg font-bold text-green-700">All accounts are healthy!</h3>
                <p className="text-green-600 text-sm mt-1">
                  No accounts need attention right now. Great job!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Link to Details */}
      <div className="mt-8 text-center">
        <Link
          href="/emails"
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          View detailed email list →
        </Link>
      </div>
    </div>
  );
}
