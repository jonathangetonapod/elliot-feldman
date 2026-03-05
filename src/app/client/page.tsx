"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useBisonData } from "@/lib/use-bison-data";
import { getMockDashboardStats, generateMockEmails, getMockDomainHealth } from "@/lib/mock-data";

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
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 60) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function getHealthScoreRingColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

// Circular progress component for health score
function HealthScoreCircle({ score }: { score: number }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = getHealthScoreRingColor(score);
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-48 h-48 transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="96"
          cy="96"
          r={radius}
          stroke="#e5e7eb"
          strokeWidth="12"
          fill="transparent"
        />
        {/* Progress circle */}
        <circle
          cx="96"
          cy="96"
          r={radius}
          stroke={color}
          strokeWidth="12"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={`text-5xl font-bold ${getHealthScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-gray-500 text-lg">out of 100</span>
      </div>
    </div>
  );
}

// Metric card component
function MetricCard({ 
  title, 
  value, 
  icon, 
  color 
}: { 
  title: string; 
  value: React.ReactNode; 
  icon: string; 
  color: "green" | "yellow" | "red" | "blue";
}) {
  const colorClasses = {
    green: "bg-green-50 border-green-200",
    yellow: "bg-yellow-50 border-yellow-200", 
    red: "bg-red-50 border-red-200",
    blue: "bg-blue-50 border-blue-200",
  };
  
  const textColors = {
    green: "text-green-700",
    yellow: "text-yellow-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };
  
  return (
    <div className={`p-6 rounded-2xl border-2 ${colorClasses[color]}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{icon}</span>
        <span className="text-gray-600 text-lg">{title}</span>
      </div>
      <div className={`text-4xl font-bold ${textColors[color]}`}>
        {value}
      </div>
    </div>
  );
}

// Status item component
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
    good: "bg-green-50",
    warning: "bg-yellow-50",
    critical: "bg-red-50",
  };
  
  return (
    <div className={`flex items-center gap-4 p-5 rounded-xl ${colors[status]}`}>
      <span className="text-3xl">{icons[status]}</span>
      <div>
        <span className="text-2xl font-bold text-gray-800">{count}</span>
        <span className="text-gray-600 text-lg ml-2">{label}</span>
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
  
  // Reply rate trend (mock for now - could be calculated from historical data)
  const replyRateTrend = replyRate >= 2.5 ? "↑" : replyRate >= 1.5 ? "→" : "↓";
  const trendColor = replyRate >= 2.5 ? "text-green-600" : replyRate >= 1.5 ? "text-yellow-600" : "text-red-600";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📊</div>
          <p className="text-gray-500 text-xl">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-12">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-10">
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
          Your Account Health
        </h1>
        <p className="text-gray-500 text-lg">
          {useMockData ? "Demo data" : "Last updated: just now"}
        </p>
      </div>
      
      {/* Health Score - Big and Center */}
      <div className="max-w-4xl mx-auto mb-12">
        <Card className={`border-2 ${getHealthScoreBg(healthScore)}`}>
          <CardContent className="p-8 lg:p-12">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-2xl font-semibold text-gray-700 mb-6">
                Overall Health Score
              </h2>
              <HealthScoreCircle score={healthScore} />
              <p className="text-gray-500 text-lg mt-6 max-w-md">
                {healthScore >= 80 
                  ? "Your accounts are performing great! Keep it up."
                  : healthScore >= 60
                  ? "Your accounts are doing okay, but there's room for improvement."
                  : "Some accounts need attention. Let's work on improving them."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="max-w-4xl mx-auto mb-12">
        <h2 className="text-xl font-semibold text-gray-700 mb-6">Key Numbers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
          <MetricCard
            title="Active Accounts"
            value={activeAccounts}
            icon="📧"
            color="green"
          />
          <MetricCard
            title="Reply Rate"
            value={
              <span>
                {replyRate}%{" "}
                <span className={`text-2xl ${trendColor}`}>{replyRateTrend}</span>
              </span>
            }
            icon="💬"
            color={replyRate >= 2 ? "green" : replyRate >= 1 ? "yellow" : "red"}
          />
          <MetricCard
            title="Needs Attention"
            value={needsAttention}
            icon="👀"
            color={needsAttention === 0 ? "green" : needsAttention <= 5 ? "yellow" : "red"}
          />
          <MetricCard
            title="Ready to Scale"
            value={readyToScale}
            icon="🚀"
            color="blue"
          />
        </div>
      </div>
      
      {/* Status Summary */}
      <div className="max-w-4xl mx-auto mb-12">
        <h2 className="text-xl font-semibold text-gray-700 mb-6">Account Status</h2>
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
      
      {/* Quick Stats */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-700 mb-6">This Week</h2>
        <div className="grid grid-cols-2 gap-4 lg:gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">Emails Sent</div>
            <div className="text-3xl font-bold text-gray-800">
              {stats.totalSentLast7Days.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">Replies Received</div>
            <div className="text-3xl font-bold text-gray-800">
              {stats.totalRepliesLast7Days.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="max-w-4xl mx-auto mt-16 text-center">
        <p className="text-gray-400">
          Need help? Contact your account manager.
        </p>
      </div>
    </div>
  );
}
