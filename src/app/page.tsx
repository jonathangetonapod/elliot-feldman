"use client";

import { useState, useEffect, useMemo } from "react";
import { generateMockEmails } from "@/lib/mock-data";
import { useBisonData } from "@/lib/use-bison-data";
import {
  fetchWarmupStats,
  type WarmupAccountComparison,
  type WarmupPeriodType,
} from "@/lib/bison-api";

// ==========================================
// 🎯 CRYSTAL CLEAR ACCOUNTS PAGE
// Goal: "Do I have accounts that need attention?" - Answer in 2 seconds
// ==========================================

type AccountStatus = 'action' | 'watch' | 'healthy';

interface SimpleAccount {
  id: number;
  email: string;
  currentReplyRate: number;
  baselineReplyRate: number;
  percentDrop: number;
  status: AccountStatus;
  statusMessage: string;
}

// Categorize accounts by reply rate drop
function categorizeAccounts(warmupData: WarmupAccountComparison[]): {
  needsAction: SimpleAccount[];
  watch: SimpleAccount[];
  healthy: SimpleAccount[];
} {
  const needsAction: SimpleAccount[] = [];
  const watch: SimpleAccount[] = [];
  const healthy: SimpleAccount[] = [];

  for (const account of warmupData) {
    const currentRate = account.current.warmup_reply_rate ?? 0;
    const baselineRate = account.baseline?.warmup_reply_rate ?? currentRate;
    const change = account.changes.warmup_reply_rate ?? 0;

    const accountData: SimpleAccount = {
      id: account.id,
      email: account.email,
      currentReplyRate: Math.round(currentRate * 10) / 10,
      baselineReplyRate: Math.round(baselineRate * 10) / 10,
      percentDrop: Math.round(Math.abs(change)),
      status: 'healthy',
      statusMessage: 'Performing well',
    };

    // 🔥 Needs Action: Reply rate dropped >30%
    if (change <= -30) {
      accountData.status = 'action';
      accountData.statusMessage = 'Reply rate dropped significantly';
      needsAction.push(accountData);
    }
    // ⚠️ Watch: Reply rate dropped 10-30%
    else if (change <= -10) {
      accountData.status = 'watch';
      accountData.statusMessage = 'Reply rate declining';
      watch.push(accountData);
    }
    // ✅ Healthy
    else {
      accountData.status = 'healthy';
      accountData.statusMessage = 'Performing well';
      healthy.push(accountData);
    }
  }

  // Sort by severity
  needsAction.sort((a, b) => b.percentDrop - a.percentDrop);
  watch.sort((a, b) => b.percentDrop - a.percentDrop);
  healthy.sort((a, b) => b.currentReplyRate - a.currentReplyRate);

  return { needsAction, watch, healthy };
}

// Status config for colors
const STATUS_CONFIG = {
  action: {
    emoji: '🔥',
    label: 'Needs Action',
    bgCard: 'bg-red-500',
    bgLight: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    textDark: 'text-white',
  },
  watch: {
    emoji: '⚠️',
    label: 'Watch',
    bgCard: 'bg-amber-500',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    textDark: 'text-white',
  },
  healthy: {
    emoji: '✅',
    label: 'Healthy',
    bgCard: 'bg-emerald-500',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    textDark: 'text-white',
  },
};

// Simple Account Row
function AccountRow({ account }: { account: SimpleAccount }) {
  const config = STATUS_CONFIG[account.status];
  
  return (
    <div className={`p-4 rounded-xl border-2 ${config.border} ${config.bgLight}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Left: Email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{config.emoji}</span>
            <span className="font-semibold text-gray-900 truncate">{account.email}</span>
          </div>
          <p className={`text-sm ${config.text}`}>{account.statusMessage}</p>
        </div>
        
        {/* Right: Stats */}
        <div className="text-right shrink-0">
          {account.status !== 'healthy' ? (
            <>
              <div className={`text-sm font-bold ${config.text}`}>
                {account.baselineReplyRate}% → {account.currentReplyRate}%
              </div>
              <div className={`text-xs ${config.text} mt-1`}>
                ↓{account.percentDrop}% drop
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-emerald-600">
              {account.currentReplyRate}% reply rate
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Big Summary Card
function SummaryCard({ 
  status, 
  count, 
  isSelected,
  onClick,
}: { 
  status: AccountStatus;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = STATUS_CONFIG[status];
  
  return (
    <button
      onClick={onClick}
      className={`
        relative w-full p-6 rounded-2xl transition-all duration-200
        ${config.bgCard} ${config.textDark}
        ${isSelected ? 'ring-4 ring-offset-2 ring-gray-900 scale-[1.02]' : 'hover:scale-[1.02]'}
        active:scale-[0.98] shadow-lg
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
          <span className="text-white text-sm">✓</span>
        </div>
      )}
      
      <div className="text-center">
        <div className="text-4xl mb-2">{config.emoji}</div>
        <div className="text-5xl lg:text-6xl font-black mb-2">{count}</div>
        <div className="text-sm lg:text-base font-semibold opacity-90 uppercase tracking-wide">
          {config.label}
        </div>
      </div>
    </button>
  );
}

// Filter Tab
function FilterTab({ 
  status, 
  count, 
  isSelected, 
  onClick,
}: { 
  status: AccountStatus | 'all';
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = status === 'all' 
    ? { emoji: '📋', label: 'All', bgLight: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' }
    : STATUS_CONFIG[status];
  
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap
        ${isSelected 
          ? `${status === 'all' ? 'bg-gray-900 text-white' : STATUS_CONFIG[status].bgCard + ' text-white'}` 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }
      `}
    >
      {config.emoji} {config.label} ({count})
    </button>
  );
}

export default function AccountsPage() {
  const { emails: bisonEmails, loading, error, connected, refetch } = useBisonData();
  
  // State
  const [timePeriod, setTimePeriod] = useState<7 | 14 | 30>(7);
  const [warmupData, setWarmupData] = useState<WarmupAccountComparison[]>([]);
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedFilter, setSelectedFilter] = useState<AccountStatus | 'all'>('action');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch warmup stats
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
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Failed to fetch warmup stats:', err);
      } finally {
        setWarmupLoading(false);
      }
    }
    fetchWarmup();
  }, [timePeriod]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const periodMap: Record<7 | 14 | 30, WarmupPeriodType> = {
        7: '7vs7',
        14: '14vs14',
        30: '30vs30',
      };
      const response = await fetchWarmupStats(periodMap[timePeriod], true);
      if (response.data) {
        setWarmupData(response.data);
        setLastUpdated(new Date());
      }
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Categorize accounts
  const { needsAction, watch, healthy } = useMemo(() => {
    if (warmupData.length === 0) {
      // Generate mock data for demo
      const mockEmails = bisonEmails.length > 0 ? bisonEmails : generateMockEmails();
      const mockAccounts: SimpleAccount[] = mockEmails.map((email, idx) => {
        const baseRate = email.replyRate || 2;
        const drop = idx < 3 ? 45 : idx < 8 ? 20 : 5;
        const current = Math.max(0.1, baseRate - (baseRate * drop / 100));
        
        let status: AccountStatus = 'healthy';
        let statusMessage = 'Performing well';
        
        if (drop > 30) {
          status = 'action';
          statusMessage = 'Reply rate dropped significantly';
        } else if (drop > 10) {
          status = 'watch';
          statusMessage = 'Reply rate declining';
        }
        
        return {
          id: email.id,
          email: email.email,
          currentReplyRate: Math.round(current * 10) / 10,
          baselineReplyRate: Math.round(baseRate * 10) / 10,
          percentDrop: drop,
          status,
          statusMessage,
        };
      });

      return {
        needsAction: mockAccounts.filter(a => a.status === 'action'),
        watch: mockAccounts.filter(a => a.status === 'watch'),
        healthy: mockAccounts.filter(a => a.status === 'healthy'),
      };
    }

    return categorizeAccounts(warmupData);
  }, [warmupData, bisonEmails]);

  // Get filtered accounts
  const filteredAccounts = useMemo(() => {
    switch (selectedFilter) {
      case 'action': return needsAction;
      case 'watch': return watch;
      case 'healthy': return healthy;
      case 'all': return [...needsAction, ...watch, ...healthy];
    }
  }, [selectedFilter, needsAction, watch, healthy]);

  // Auto-select based on what needs attention
  useEffect(() => {
    if (needsAction.length > 0) {
      setSelectedFilter('action');
    } else if (watch.length > 0) {
      setSelectedFilter('watch');
    } else {
      setSelectedFilter('healthy');
    }
  }, [needsAction.length, watch.length]);

  const isLoading = loading || warmupLoading;
  const useMockData = !connected || error || warmupData.length === 0;
  const totalAccounts = needsAction.length + watch.length + healthy.length;

  // Format last updated
  const formatLastUpdated = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 pb-24 lg:pb-8">
      <div className="max-w-3xl mx-auto">
        
        {/* ===== HEADER ===== */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
              📧 Accounts
            </h1>
            
            {/* Demo Mode Badge */}
            {useMockData && (
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                Demo Mode
              </span>
            )}
          </div>
          
          {/* Last Updated + Controls */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>Last updated: {formatLastUpdated(lastUpdated)}</span>
            
            {/* Time Period Dropdown */}
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(Number(e.target.value) as 7 | 14 | 30)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm cursor-pointer hover:border-gray-300"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
              Refresh
            </button>
          </div>
        </div>

        {/* ===== LOADING STATE ===== */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading accounts...</p>
          </div>
        )}

        {/* ===== MAIN CONTENT ===== */}
        {!isLoading && (
          <>
            {/* ===== 3 BIG SUMMARY CARDS ===== */}
            <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-6">
              <SummaryCard
                status="action"
                count={needsAction.length}
                isSelected={selectedFilter === 'action'}
                onClick={() => setSelectedFilter('action')}
              />
              <SummaryCard
                status="watch"
                count={watch.length}
                isSelected={selectedFilter === 'watch'}
                onClick={() => setSelectedFilter('watch')}
              />
              <SummaryCard
                status="healthy"
                count={healthy.length}
                isSelected={selectedFilter === 'healthy'}
                onClick={() => setSelectedFilter('healthy')}
              />
            </div>

            {/* ===== ALL HEALTHY MESSAGE ===== */}
            {needsAction.length === 0 && watch.length === 0 && healthy.length > 0 && (
              <div className="mb-6 p-6 rounded-2xl bg-gradient-to-r from-emerald-100 to-green-100 border-2 border-emerald-200 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="text-xl font-bold text-emerald-700 mb-1">All accounts healthy!</h2>
                <p className="text-emerald-600 text-sm">No accounts need attention right now. Great job!</p>
              </div>
            )}

            {/* ===== FILTER TABS ===== */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0">
              <FilterTab
                status="action"
                count={needsAction.length}
                isSelected={selectedFilter === 'action'}
                onClick={() => setSelectedFilter('action')}
              />
              <FilterTab
                status="watch"
                count={watch.length}
                isSelected={selectedFilter === 'watch'}
                onClick={() => setSelectedFilter('watch')}
              />
              <FilterTab
                status="healthy"
                count={healthy.length}
                isSelected={selectedFilter === 'healthy'}
                onClick={() => setSelectedFilter('healthy')}
              />
              <FilterTab
                status="all"
                count={totalAccounts}
                isSelected={selectedFilter === 'all'}
                onClick={() => setSelectedFilter('all')}
              />
            </div>

            {/* ===== ACCOUNT LIST ===== */}
            <div className="space-y-3">
              {filteredAccounts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                  <div className="text-4xl mb-3">
                    {selectedFilter === 'action' ? '✨' : selectedFilter === 'watch' ? '👀' : '📭'}
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    {selectedFilter === 'action' 
                      ? 'No accounts need action!' 
                      : selectedFilter === 'watch'
                      ? 'No accounts to watch!'
                      : 'No accounts found'}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {selectedFilter === 'action' || selectedFilter === 'watch'
                      ? 'All your accounts are performing well.'
                      : 'Connect accounts to start monitoring.'}
                  </p>
                </div>
              ) : (
                filteredAccounts.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))
              )}
            </div>

            {/* ===== EMPTY STATE ===== */}
            {totalAccounts === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <div className="text-5xl mb-4">📭</div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">No accounts found</h3>
                <p className="text-gray-500">Connect your email accounts to start monitoring their health.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
