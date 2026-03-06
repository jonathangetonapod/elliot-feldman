"use client";

import { useMemo, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
  ComposedChart,
  Line,
} from "recharts";

// Types
export interface AccountDetailData {
  id: number;
  email: string;
  name: string;
  domain: string;
  status: string;

  // Warmup info
  warmupEnabled: boolean;
  dailyLimit: number;

  // Campaign stats (lifetime from Bison sender-emails endpoint)
  totalSent: number;
  totalReplies: number;

  // Timestamps
  createdAt: string;
}

interface AccountDetailModalProps {
  account: AccountDetailData | null;
  isOpen: boolean;
  onClose: () => void;
}

// Format date helper
function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Calculate days since creation
function getDaysActive(createdAt: string): number {
  try {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

// Weekly history chart component
function WeeklyHistoryChart({ data }: { data: { week: number; label: string; warmupReplyRate: number; warmupEmailsSent: number }[] }) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      label: `W${i + 1}`,
      fullLabel: d.label,
      rate: d.warmupReplyRate,
      sent: d.warmupEmailsSent,
    }));
  }, [data]);

  if (chartData.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Not enough data for chart
      </div>
    );
  }

  const firstNonZero = chartData.find(d => d.rate > 0);
  const lastNonZero = [...chartData].reverse().find(d => d.rate > 0);
  const isUp = firstNonZero && lastNonZero && lastNonZero.rate > firstNonZero.rate;
  const isDown = firstNonZero && lastNonZero && lastNonZero.rate < firstNonZero.rate * 0.8;
  const lineColor = isUp ? '#22c55e' : isDown ? '#ef4444' : '#3b82f6';

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="weeklyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={lineColor} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            interval={0}
            height={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 'auto']}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any, name: any) => {
              if (name === 'rate' && typeof value === 'number') return [`${value.toFixed(1)}%`, 'WU Reply Rate'];
              return [value ?? 0, name ?? ''];
            }) as any}
            labelFormatter={(label, payload) => {
              const item = payload?.[0]?.payload;
              return item?.fullLabel || label;
            }}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              fontSize: '12px',
            }}
          />
          <ReferenceLine
            y={20}
            stroke="#22c55e"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: '20% (healthy)', position: 'right', fontSize: 9, fill: '#22c55e' }}
          />
          <Area
            type="monotone"
            dataKey="rate"
            fill="url(#weeklyGradient)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={lineColor}
            strokeWidth={2.5}
            dot={{ r: 4, fill: lineColor, stroke: 'white', strokeWidth: 2 }}
            activeDot={{ r: 7, stroke: lineColor, strokeWidth: 2, fill: 'white' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Weekly history data point
interface WeeklyDataPoint {
  week: number;
  label: string;
  startDate: string;
  endDate: string;
  warmupReplyRate: number;
  warmupEmailsSent: number;
  warmupRepliesReceived: number;
  warmupScore: number;
  warmupBounces: number;
}

// Fresh account details from the history API (more up-to-date than props)
interface FreshAccountDetails {
  id: number;
  name?: string;
  email: string;
  createdAt: string;
  warmupEnabled: boolean;
  dailyLimit: number;
  status: string;
  emailsSent: number;
  totalReplies: number;
  uniqueReplies: number;
  totalOpened: number;
  bounced: number;
  unsubscribed: number;
  leadsContacted: number;
  interestedLeads: number;
  tags?: { id: number; name: string }[];
}

export function AccountDetailModal({ account, isOpen, onClose }: AccountDetailModalProps) {
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyDataPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [freshDetails, setFreshDetails] = useState<FreshAccountDetails | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  // Fetch weekly history when modal opens
  useEffect(() => {
    if (!isOpen || !account) {
      setWeeklyHistory([]);
      setFreshDetails(null);
      return;
    }

    async function fetchHistory() {
      setHistoryLoading(true);
      try {
        const params = new URLSearchParams({ email: account!.email });
        if (account!.id) params.set('id', String(account!.id));
        const res = await fetch(`/api/bison/warmup/history?${params}`);
        if (res.ok) {
          const data = await res.json();
          setWeeklyHistory(data.weeks || []);
          setFetchedAt(new Date());
          if (data.accountDetails) {
            setFreshDetails(data.accountDetails);
          }
        }
      } catch (err) {
        console.error('Failed to fetch weekly history:', err);
      } finally {
        setHistoryLoading(false);
      }
    }

    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, account?.email, account?.id]);

  if (!isOpen || !account) return null;

  // Prefer fresh data from the history API over stale props
  const effectiveCreatedAt = freshDetails?.createdAt || account.createdAt;
  const effectiveDailyLimit = freshDetails?.dailyLimit ?? account.dailyLimit;
  const effectiveWarmupEnabled = freshDetails?.warmupEnabled ?? account.warmupEnabled;
  const effectiveTotalSent = freshDetails?.emailsSent ?? account.totalSent;
  const effectiveTotalReplies = freshDetails?.totalReplies ?? account.totalReplies;

  const daysActive = getDaysActive(effectiveCreatedAt);
  const isConnected = account.status !== 'disconnected';

  // Compute current warmup stats from most recent week WITH actual sends
  // (the latest calendar week may be incomplete with 0 sends)
  const weeksWithData = weeklyHistory.filter(w => w.warmupEmailsSent > 0);
  const latestWeek = weeksWithData.length > 0 ? weeksWithData[weeksWithData.length - 1] : null;
  const prevWeek = weeksWithData.length > 1 ? weeksWithData[weeksWithData.length - 2] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:bg-black/30"
        onClick={onClose}
      />

      {/* Modal/Panel */}
      <div className="fixed inset-0 z-50 lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[500px] bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="font-semibold truncate">{account.email}</span>
          </div>
          <Badge variant="outline" className={`text-xs ${
            isConnected ? 'border-green-200 text-green-700 bg-green-50' : 'border-red-200 text-red-700 bg-red-50'
          }`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 pb-8">
          {/* Account info line */}
          <div>
            <div className="text-sm text-gray-500 mb-2">{account.name} · {account.domain}</div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <Badge variant="outline" className="text-xs">{daysActive}d active</Badge>
              <Badge variant="outline" className={`text-xs ${effectiveWarmupEnabled ? 'border-green-200 bg-green-50 text-green-700' : ''}`}>
                Warmup {effectiveWarmupEnabled ? 'ON' : 'OFF'}
              </Badge>
              <Badge variant="outline" className="text-xs">{effectiveDailyLimit}/day limit</Badge>
              {effectiveTotalSent > 0 && (
                <span className="inline-flex items-center">
                  <Badge variant="outline" className="text-xs">
                    {effectiveTotalSent.toLocaleString()} sent · {effectiveTotalReplies.toLocaleString()} replies
                  </Badge>
                  <InfoTooltip text={`Campaign sends (lifetime): ${effectiveTotalSent.toLocaleString()} emails sent, ${effectiveTotalReplies.toLocaleString()} replies, ${((effectiveTotalReplies / effectiveTotalSent) * 100).toFixed(1)}% reply rate. Campaign reply rates of 0.5–5% are normal for cold email.`} />
                </span>
              )}
            </div>
          </div>

          {/* Plain-English verdict — action-oriented, no numbers */}
          {!historyLoading && weeksWithData.length > 0 && (() => {
            const latestRate = latestWeek?.warmupReplyRate ?? 0;
            const wowChange = prevWeek && latestWeek
              ? latestWeek.warmupReplyRate - prevWeek.warmupReplyRate
              : 0;
            const latestBounceRate = latestWeek && latestWeek.warmupEmailsSent > 0
              ? (latestWeek.warmupBounces / latestWeek.warmupEmailsSent) * 100 : 0;

            let verdict: { text: string; action: string; color: string; bg: string };

            if (latestRate >= 20 && latestBounceRate < 2) {
              verdict = {
                text: 'Healthy — no action needed',
                action: wowChange > 2 ? 'Reply rate is climbing. Keep current settings.' : wowChange < -5 ? 'Slight dip this week — check again next week.' : 'Everything looks good. Keep sending.',
                color: 'text-green-700',
                bg: 'bg-green-50 border-green-200',
              };
            } else if (latestRate >= 10) {
              verdict = {
                text: 'Needs watching — monitor this week',
                action: 'Reply rate is below the 20% healthy threshold. If it keeps dropping, consider pausing campaigns from this account.',
                color: 'text-yellow-700',
                bg: 'bg-yellow-50 border-yellow-200',
              };
            } else {
              verdict = {
                text: 'At risk — consider pausing this account',
                action: 'Email providers may be losing trust. Pause campaigns and let warmup recover, or rotate to a different domain.',
                color: 'text-red-700',
                bg: 'bg-red-50 border-red-200',
              };
            }

            return (
              <div className={`p-3 rounded-lg border ${verdict.bg}`}>
                <div className={`text-sm font-semibold ${verdict.color}`}>{verdict.text}</div>
                <div className="text-xs text-gray-600 mt-1">{verdict.action}</div>
              </div>
            );
          })()}

          {/* 3 key numbers: reply rate, week-over-week change, bounce rate */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className={`text-2xl font-bold ${
                (latestWeek?.warmupReplyRate ?? 0) >= 20 ? 'text-green-600' :
                (latestWeek?.warmupReplyRate ?? 0) >= 10 ? 'text-yellow-600' :
                latestWeek ? 'text-red-600' : 'text-gray-400'
              }`}>
                {latestWeek ? `${latestWeek.warmupReplyRate.toFixed(1)}%` : '-'}
              </div>
              <div className="text-xs text-gray-500 mt-1">reply rate</div>
              <div className="text-xs text-gray-400 mt-0.5">this week</div>
            </div>
            <div>
              {prevWeek && latestWeek ? (() => {
                const change = latestWeek.warmupReplyRate - prevWeek.warmupReplyRate;
                const isUp = change > 0;
                const isDown = change < 0;
                return (
                  <>
                    <div className={`text-2xl font-bold ${isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-gray-400'}`}>
                      {isUp ? '+' : ''}{change.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">pts change</div>
                    <div className="text-xs text-gray-400 mt-0.5">vs last week</div>
                  </>
                );
              })() : (
                <>
                  <div className="text-2xl font-bold text-gray-400">-</div>
                  <div className="text-xs text-gray-500 mt-1">pts change</div>
                  <div className="text-xs text-gray-400 mt-0.5">no prior week</div>
                </>
              )}
            </div>
            <div>
              {(() => {
                const bounceRate = latestWeek && latestWeek.warmupEmailsSent > 0
                  ? (latestWeek.warmupBounces / latestWeek.warmupEmailsSent) * 100 : 0;
                return (
                  <>
                    <div className={`text-2xl font-bold ${bounceRate > 2 ? 'text-red-600' : bounceRate > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>
                      {latestWeek ? `${bounceRate.toFixed(1)}%` : '-'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">bounce rate</div>
                    <div className="text-xs text-gray-400 mt-0.5">this week</div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Reply rate trend chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Reply Rate Over Time</span>
              <span className="text-xs text-gray-400">{weeksWithData.length} weeks of data</span>
            </div>
            {historyLoading ? (
              <div className="h-48 flex items-center justify-center text-gray-400">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400 mx-auto" />
              </div>
            ) : weeklyHistory.length > 0 ? (
              <WeeklyHistoryChart data={weeklyHistory} />
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                No history available yet
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-xs text-gray-400 pt-2 border-t flex justify-between">
            <span>Created {formatDate(effectiveCreatedAt)}</span>
            {fetchedAt && <span>Synced {fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>

          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors lg:hidden"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
