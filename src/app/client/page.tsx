"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useBisonData } from "@/lib/use-bison-data";
import { getMockDashboardStats, generateMockEmails, getMockDomainHealth } from "@/lib/mock-data";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// Calculate overall health score (0-100)
function calculateHealthScore(stats: {
  healthyEmails: number;
  warningEmails: number;
  burnedEmails: number;
  totalEmails: number;
  avgReplyRate: number;
  warmingEmails: number;
  readyEmails: number;
}): number {
  if (stats.totalEmails === 0) return 0;
  
  // Weight factors
  const healthyRatio = stats.healthyEmails / stats.totalEmails;
  const warningRatio = stats.warningEmails / stats.totalEmails;
  const burnedRatio = stats.burnedEmails / stats.totalEmails;
  const readyRatio = stats.readyEmails / stats.totalEmails;
  
  // Health score components:
  // - 50% based on healthy/warning/burned status
  // - 25% based on reply rate (normalized: 0% = 0, 5%+ = 25)
  // - 25% based on warmup completion
  
  const statusScore = (healthyRatio * 50) + (warningRatio * 25) + (burnedRatio * 0);
  const replyRateScore = Math.min(stats.avgReplyRate / 5, 1) * 25;
  const warmupScore = readyRatio * 25;
  
  const total = statusScore + replyRateScore + warmupScore;
  return Math.round(total);
}

// Get health score color
function getHealthScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function getHealthScoreBg(score: number): string {
  if (score >= 80) return "bg-gradient-to-br from-green-50 to-green-100 border-green-300";
  if (score >= 60) return "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300";
  return "bg-gradient-to-br from-red-50 to-red-100 border-red-300";
}

function getHealthScoreRingColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

function getHealthScoreEmoji(score: number): string {
  if (score >= 80) return "🟢";
  if (score >= 60) return "🟡";
  return "🔴";
}

// Animated Circular Gauge Component using recharts
function HealthScoreGauge({ score }: { score: number }) {
  const color = getHealthScoreRingColor(score);
  const emoji = getHealthScoreEmoji(score);
  
  // Data for gauge
  const data = [
    { value: score, color: color },
    { value: 100 - score, color: "#e5e7eb" },
  ];
  
  return (
    <div className="relative w-56 h-56 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius={70}
            outerRadius={100}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: '-20px' }}>
        <span className="text-5xl mb-1">{emoji}</span>
        <span className={`text-5xl font-bold ${getHealthScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-gray-500 text-lg font-medium">out of 100</span>
      </div>
    </div>
  );
}

// Trend Arrow Component
function TrendArrow({ trend, size = "lg" }: { trend: "up" | "down" | "stable"; size?: "sm" | "lg" }) {
  const sizeClasses = size === "lg" ? "text-3xl" : "text-xl";
  
  if (trend === "up") {
    return <span className={`${sizeClasses} text-green-600`}>↑</span>;
  }
  if (trend === "down") {
    return <span className={`${sizeClasses} text-red-600`}>↓</span>;
  }
  return <span className={`${sizeClasses} text-gray-400`}>→</span>;
}

// Big Metric Card Component
function BigMetricCard({ 
  emoji,
  title, 
  value, 
  subtext,
  trend,
  status,
}: { 
  emoji: string;
  title: string; 
  value: string | number; 
  subtext?: string;
  trend?: "up" | "down" | "stable";
  status: "good" | "warning" | "critical" | "neutral";
}) {
  const statusStyles = {
    good: "bg-gradient-to-br from-green-50 to-green-100 border-green-300",
    warning: "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300", 
    critical: "bg-gradient-to-br from-red-50 to-red-100 border-red-300",
    neutral: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300",
  };
  
  const textColors = {
    good: "text-green-700",
    warning: "text-yellow-700",
    critical: "text-red-700",
    neutral: "text-blue-700",
  };
  
  return (
    <Card className={`border-2 hover:shadow-xl transition-all ${statusStyles[status]}`}>
      <CardContent className="p-6 lg:p-8">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{emoji}</span>
            <span className="text-gray-600 text-lg font-medium">{title}</span>
          </div>
          {trend && <TrendArrow trend={trend} />}
        </div>
        <div className={`text-5xl lg:text-6xl font-bold ${textColors[status]}`}>
          {value}
        </div>
        {subtext && (
          <div className="text-gray-500 text-lg mt-2">{subtext}</div>
        )}
      </CardContent>
    </Card>
  );
}

// Status Item with Big Visual
function StatusItem({
  status,
  count,
  label,
}: {
  status: "good" | "warning" | "critical";
  count: number;
  label: string;
}) {
  const icons = {
    good: "✅",
    warning: "⚠️",
    critical: "🔴",
  };
  
  const colors = {
    good: "bg-gradient-to-r from-green-50 to-green-100 border-green-300",
    warning: "bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-300",
    critical: "bg-gradient-to-r from-red-50 to-red-100 border-red-300",
  };

  const textColors = {
    good: "text-green-700",
    warning: "text-yellow-700",
    critical: "text-red-700",
  };
  
  return (
    <div className={`flex items-center gap-6 p-6 rounded-2xl border-2 ${colors[status]} hover:shadow-lg transition-all`}>
      <span className="text-5xl">{icons[status]}</span>
      <div>
        <span className={`text-4xl font-bold ${textColors[status]}`}>{count}</span>
        <span className="text-gray-600 text-xl ml-3">{label}</span>
      </div>
    </div>
  );
}

// Visual Progress Bar
function VisualProgressBar({ 
  value, 
  max, 
  label,
  showPercentage = true,
}: { 
  value: number; 
  max: number; 
  label: string;
  showPercentage?: boolean;
}) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = percentage >= 80 ? "bg-green-500" : percentage >= 50 ? "bg-yellow-500" : "bg-red-500";
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-gray-600">{label}</span>
        {showPercentage && (
          <span className="font-bold text-gray-800">{percentage}%</span>
        )}
      </div>
      <div className="h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
        <div 
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Health Distribution Donut
function HealthDistributionDonut({ 
  healthy, 
  warning, 
  burned 
}: { 
  healthy: number; 
  warning: number; 
  burned: number;
}) {
  const total = healthy + warning + burned;
  if (total === 0) return null;
  
  const data = [
    { value: healthy, color: "#22c55e", label: "Healthy" },
    { value: warning, color: "#eab308", label: "Warning" },
    { value: burned, color: "#ef4444", label: "Burned" },
  ].filter(d => d.value > 0);
  
  return (
    <div className="flex items-center gap-6">
      <div className="w-32 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-500"></span>
          <span className="text-lg">✅ {healthy} healthy</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
          <span className="text-lg">⚠️ {warning} warning</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-red-500"></span>
          <span className="text-lg">🔴 {burned} burned</span>
        </div>
      </div>
    </div>
  );
}

export default function ClientDashboard() {
  const { stats: bisonStats, emails: bisonEmails, loading, error, connected } = useBisonData();
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || !bisonStats;
  const stats = useMockData ? getMockDashboardStats() : bisonStats;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  
  // Calculate health score
  const healthScore = calculateHealthScore(stats);
  
  // Calculate metrics
  const activeAccounts = stats.healthyEmails;
  const replyRate = stats.avgReplyRate;
  const needsAttention = stats.warningEmails + stats.burnedEmails;
  const readyToScale = stats.readyEmails;
  
  // Status counts
  const performingWell = stats.healthyEmails;
  const needsReview = stats.warningEmails;
  const shouldReplace = stats.burnedEmails;
  
  // Reply rate trend
  const replyRateTrend = replyRate >= 2.5 ? "up" : replyRate >= 1.5 ? "stable" : "down";
  const replyRateStatus = replyRate >= 2 ? "good" : replyRate >= 1 ? "warning" : "critical";
  
  // Needs attention status
  const attentionStatus = needsAttention === 0 ? "good" : needsAttention <= 5 ? "warning" : "critical";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">📊</div>
          <p className="text-gray-500 text-2xl">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-6 lg:p-12">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-10">
        <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-3 flex items-center gap-4">
          <span className="text-5xl">📊</span>
          Your Account Health
        </h1>
        <p className="text-gray-500 text-xl">
          {useMockData ? "📋 Demo data" : "🔄 Last updated: just now"}
        </p>
      </div>
      
      {/* Health Score - Big and Center */}
      <div className="max-w-5xl mx-auto mb-12">
        <Card className={`border-2 ${getHealthScoreBg(healthScore)} hover:shadow-2xl transition-all`}>
          <CardContent className="p-8 lg:p-12">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-2xl lg:text-3xl font-semibold text-gray-700 mb-8">
                Overall Health Score
              </h2>
              <HealthScoreGauge score={healthScore} />
              <p className="text-gray-600 text-xl mt-8 max-w-lg">
                {healthScore >= 80 
                  ? "🎉 Your accounts are performing great! Keep it up."
                  : healthScore >= 60
                  ? "👍 Your accounts are doing okay, but there's room for improvement."
                  : "⚠️ Some accounts need attention. Let's work on improving them."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Key Metrics Grid - Big Bold Numbers */}
      <div className="max-w-5xl mx-auto mb-12">
        <h2 className="text-2xl font-semibold text-gray-700 mb-6 flex items-center gap-3">
          <span className="text-3xl">📈</span>
          Key Numbers
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <BigMetricCard
            emoji="📧"
            title="Active Accounts"
            value={activeAccounts}
            subtext={`${stats.totalEmails} total`}
            status="neutral"
          />
          <BigMetricCard
            emoji="💬"
            title="Reply Rate"
            value={`${replyRate}%`}
            subtext="7-day average"
            trend={replyRateTrend}
            status={replyRateStatus}
          />
          <BigMetricCard
            emoji="👀"
            title="Needs Attention"
            value={needsAttention}
            subtext={needsAttention === 0 ? "All accounts healthy!" : "Accounts to review"}
            status={attentionStatus}
          />
          <BigMetricCard
            emoji="🚀"
            title="Ready to Scale"
            value={readyToScale}
            subtext="Warmup complete"
            status={readyToScale >= stats.totalEmails * 0.7 ? "good" : "warning"}
          />
        </div>
      </div>
      
      {/* Account Status Summary */}
      <div className="max-w-5xl mx-auto mb-12">
        <h2 className="text-2xl font-semibold text-gray-700 mb-6 flex items-center gap-3">
          <span className="text-3xl">🏥</span>
          Account Status
        </h2>
        <div className="space-y-4">
          <StatusItem
            status="good"
            count={performingWell}
            label="accounts performing well"
          />
          {needsReview > 0 && (
            <StatusItem
              status="warning"
              count={needsReview}
              label="accounts need review"
            />
          )}
          {shouldReplace > 0 && (
            <StatusItem
              status="critical"
              count={shouldReplace}
              label="accounts should be replaced"
            />
          )}
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="max-w-5xl mx-auto mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health Distribution */}
          <Card className="border-2 hover:shadow-xl transition-all">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-gray-700 mb-6 flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Health Distribution
              </h3>
              <HealthDistributionDonut 
                healthy={stats.healthyEmails}
                warning={stats.warningEmails}
                burned={stats.burnedEmails}
              />
            </CardContent>
          </Card>

          {/* Warmup Progress */}
          <Card className="border-2 hover:shadow-xl transition-all">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-gray-700 mb-6 flex items-center gap-2">
                <span className="text-2xl">🔥</span>
                Warmup Progress
              </h3>
              <div className="space-y-6">
                <VisualProgressBar 
                  value={stats.readyEmails} 
                  max={stats.totalEmails} 
                  label="Ready to send"
                />
                <VisualProgressBar 
                  value={stats.warmingEmails} 
                  max={stats.totalEmails} 
                  label="Still warming"
                />
                <div className="pt-4 border-t">
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-600">🟢 Ready</span>
                    <span className="font-bold text-green-600">{stats.readyEmails}</span>
                  </div>
                  <div className="flex justify-between text-lg mt-2">
                    <span className="text-gray-600">🔥 Warming</span>
                    <span className="font-bold text-orange-600">{stats.warmingEmails}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="max-w-5xl mx-auto mb-12">
        <h2 className="text-2xl font-semibold text-gray-700 mb-6 flex items-center gap-3">
          <span className="text-3xl">📅</span>
          This Week
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <Card className="border-2 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 hover:shadow-xl transition-all">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">📤</span>
                <span className="text-gray-600 text-lg">Emails Sent</span>
              </div>
              <div className="text-5xl font-bold text-blue-700">
                {stats.totalSentLast7Days.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 hover:shadow-xl transition-all">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-4xl">💬</span>
                <span className="text-gray-600 text-lg">Replies Received</span>
              </div>
              <div className="text-5xl font-bold text-purple-700">
                {stats.totalRepliesLast7Days.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* At a Glance Summary */}
      <div className="max-w-5xl mx-auto mb-12">
        <Card className="border-2 bg-white hover:shadow-xl transition-all">
          <CardContent className="p-8">
            <h3 className="text-xl font-semibold text-gray-700 mb-6 flex items-center gap-2">
              <span className="text-2xl">👁️</span>
              At a Glance
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <span className="text-4xl block mb-2">✅</span>
                <span className="text-2xl font-bold text-green-700">{stats.healthyEmails}</span>
                <span className="text-gray-600 block">Healthy</span>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-xl">
                <span className="text-4xl block mb-2">⚠️</span>
                <span className="text-2xl font-bold text-yellow-700">{stats.warningEmails}</span>
                <span className="text-gray-600 block">Warning</span>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-xl">
                <span className="text-4xl block mb-2">🔴</span>
                <span className="text-2xl font-bold text-red-700">{stats.burnedEmails}</span>
                <span className="text-gray-600 block">Burned</span>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <span className="text-4xl block mb-2">📧</span>
                <span className="text-2xl font-bold text-blue-700">{stats.totalEmails}</span>
                <span className="text-gray-600 block">Total</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Footer */}
      <div className="max-w-5xl mx-auto mt-16 text-center">
        <p className="text-gray-400 text-lg">
          Need help? Contact your account manager. 💬
        </p>
      </div>
    </div>
  );
}
