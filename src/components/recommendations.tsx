"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SenderEmail, DomainHealth } from "@/lib/mock-data";

export type RecommendationPriority = "critical" | "warning" | "info";

export interface Recommendation {
  id: string;
  priority: RecommendationPriority;
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
  };
}

// Helper to get domain stats from emails
function getDomainStats(emails: SenderEmail[]): Map<string, { count: number; totalReplyRate: number; avgReplyRate: number }> {
  const domainMap = new Map<string, { count: number; totalReplyRate: number }>();
  
  emails.forEach(email => {
    const existing = domainMap.get(email.domain) || { count: 0, totalReplyRate: 0 };
    existing.count++;
    existing.totalReplyRate += email.replyRate;
    domainMap.set(email.domain, existing);
  });
  
  const result = new Map<string, { count: number; totalReplyRate: number; avgReplyRate: number }>();
  domainMap.forEach((stats, domain) => {
    result.set(domain, {
      ...stats,
      avgReplyRate: stats.totalReplyRate / stats.count
    });
  });
  
  return result;
}

export function generateRecommendations(emails: SenderEmail[], domains: DomainHealth[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // 🔴 Rule 1: Account has sent >1000 emails with <0.5% reply rate - CRITICAL
  const lowPerformingHighVolume = emails.filter(
    e => e.sentLast7Days > 1000 && e.replyRate < 0.5
  );
  
  lowPerformingHighVolume.forEach(email => {
    recommendations.push({
      id: `replace-${email.id}`,
      priority: "critical",
      icon: "🔴",
      title: "Account needs replacement",
      description: `${email.email} has sent ${email.sentLast7Days.toLocaleString()} emails with only ${email.replyRate}% reply rate - consider replacing`,
      action: {
        label: "View Account",
        href: `/emails?search=${encodeURIComponent(email.email)}`
      }
    });
  });
  
  // Also check for total sent (not just last 7 days) for accounts with very low reply rate
  const criticalAccounts = emails.filter(
    e => e.sentLast7Days > 200 && e.replyRate < 0.5 && !lowPerformingHighVolume.includes(e)
  ).slice(0, 3); // Limit to top 3
  
  criticalAccounts.forEach(email => {
    recommendations.push({
      id: `low-performance-${email.id}`,
      priority: "critical",
      icon: "🔴",
      title: "Very low reply rate",
      description: `${email.email} has sent ${email.sentLast7Days} emails with ${email.replyRate}% reply rate - consider replacing`,
      action: {
        label: "View Account",
        href: `/emails?search=${encodeURIComponent(email.email)}`
      }
    });
  });
  
  // 🟡 Rule 2: Domain with all accounts underperforming (<1% avg reply rate) - WARNING
  const domainStats = getDomainStats(emails);
  
  domainStats.forEach((stats, domain) => {
    if (stats.avgReplyRate < 1 && stats.count >= 2) {
      recommendations.push({
        id: `domain-underperform-${domain}`,
        priority: "warning",
        icon: "🟡",
        title: "Domain underperforming",
        description: `${domain} has ${stats.count} accounts, all with low performance (${stats.avgReplyRate.toFixed(2)}% avg reply rate)`,
        action: {
          label: "View Domain",
          href: `/emails?domain=${encodeURIComponent(domain)}`
        }
      });
    }
  });
  
  // 🟢 Rule 3: Warmup complete - ready to increase volume
  const warmupComplete = emails.filter(
    e => e.warmupStatus === 'warming' && e.dailyLimit >= 50
  );
  
  if (warmupComplete.length > 0) {
    recommendations.push({
      id: "warmup-complete",
      priority: "info",
      icon: "🟢",
      title: "Warmup complete",
      description: `${warmupComplete.length} account${warmupComplete.length > 1 ? 's have' : ' has'} completed warmup - ready to increase volume`,
      action: {
        label: "View Accounts",
        href: "/emails?warmupStatus=warming"
      }
    });
  }
  
  // Also check for accounts that are "ready" status with high daily limit
  const fullyWarmedReady = emails.filter(
    e => e.warmupStatus === 'ready' && e.dailyLimit >= 50
  );
  
  if (fullyWarmedReady.length >= 10) {
    recommendations.push({
      id: "high-capacity-available",
      priority: "info",
      icon: "🟢",
      title: "High capacity available",
      description: `${fullyWarmedReady.length} accounts are fully warmed with 50+ daily capacity - consider scaling campaigns`,
      action: {
        label: "View Ready Accounts",
        href: "/emails?warmupStatus=ready"
      }
    });
  }
  
  // ⚠️ Rule 4: Accounts with warmup disabled
  const warmupDisabled = emails.filter(e => e.warmupStatus === 'paused');
  
  if (warmupDisabled.length > 0) {
    recommendations.push({
      id: "warmup-disabled",
      priority: "warning",
      icon: "⚠️",
      title: "Warmup disabled",
      description: `${warmupDisabled.length} account${warmupDisabled.length > 1 ? 's have' : ' has'} warmup disabled - enable to protect reputation`,
      action: {
        label: "View Accounts",
        href: "/emails?warmupStatus=paused"
      }
    });
  }
  
  // 📈 Rule 5: Top performer - consider using similar setup
  const sortedByPerformance = [...emails]
    .filter(e => e.sentLast7Days > 50) // Only consider accounts with meaningful volume
    .sort((a, b) => b.replyRate - a.replyRate);
  
  const topPerformer = sortedByPerformance[0];
  
  if (topPerformer && topPerformer.replyRate > 3) {
    recommendations.push({
      id: "top-performer",
      priority: "info",
      icon: "📈",
      title: "Top performer identified",
      description: `${topPerformer.email} has ${topPerformer.replyRate}% reply rate - consider using similar setup for other accounts`,
      action: {
        label: "View Account",
        href: `/emails?search=${encodeURIComponent(topPerformer.email)}`
      }
    });
  }
  
  // Additional insight: Blacklisted domains
  const blacklistedDomains = domains.filter(d => d.blacklistStatus === 'listed');
  
  if (blacklistedDomains.length > 0) {
    recommendations.push({
      id: "blacklisted-domains",
      priority: "critical",
      icon: "🚨",
      title: "Domains blacklisted",
      description: `${blacklistedDomains.length} domain${blacklistedDomains.length > 1 ? 's are' : ' is'} currently blacklisted - immediate action required`,
      action: {
        label: "View Domains",
        href: "/domains"
      }
    });
  }
  
  // Sort by priority: critical first, then warning, then info
  const priorityOrder: Record<RecommendationPriority, number> = {
    critical: 0,
    warning: 1,
    info: 2
  };
  
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// LocalStorage key for dismissed recommendations
const DISMISSED_KEY = "elliot-feldman-dismissed-recommendations";

function getDismissedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check for expiry (dismiss for 24 hours)
      const now = Date.now();
      const valid = Object.entries(parsed)
        .filter(([, timestamp]) => now - (timestamp as number) < 24 * 60 * 60 * 1000)
        .map(([id]) => id);
      return new Set(valid);
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function dismissRecommendation(id: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    const existing = stored ? JSON.parse(stored) : {};
    existing[id] = Date.now();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage errors
  }
}

interface RecommendationsProps {
  emails: SenderEmail[];
  domains: DomainHealth[];
  maxItems?: number;
}

export function Recommendations({ emails, domains, maxItems = 5 }: RecommendationsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    // Initialize from localStorage on client side
    if (typeof window !== 'undefined') {
      return getDismissedIds();
    }
    return new Set();
  });
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    // Mark as mounted for hydration safety
    const timer = requestAnimationFrame(() => {
      setMounted(true);
      setDismissedIds(getDismissedIds());
    });
    return () => cancelAnimationFrame(timer);
  }, []);
  
  const allRecommendations = generateRecommendations(emails, domains);
  const visibleRecommendations = allRecommendations
    .filter(r => !dismissedIds.has(r.id))
    .slice(0, maxItems);
  
  const handleDismiss = (id: string) => {
    dismissRecommendation(id);
    setDismissedIds(prev => new Set([...prev, id]));
  };
  
  const priorityStyles: Record<RecommendationPriority, { bg: string; border: string; badge: string; badgeBg: string }> = {
    critical: {
      bg: "bg-red-50",
      border: "border-red-200",
      badge: "text-red-700",
      badgeBg: "bg-red-100"
    },
    warning: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      badge: "text-yellow-700",
      badgeBg: "bg-yellow-100"
    },
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      badge: "text-blue-700",
      badgeBg: "bg-blue-100"
    }
  };
  
  const priorityLabels: Record<RecommendationPriority, string> = {
    critical: "Critical",
    warning: "Warning",
    info: "Info"
  };
  
  // Count by priority
  const criticalCount = allRecommendations.filter(r => r.priority === "critical" && !dismissedIds.has(r.id)).length;
  const warningCount = allRecommendations.filter(r => r.priority === "warning" && !dismissedIds.has(r.id)).length;
  const infoCount = allRecommendations.filter(r => r.priority === "info" && !dismissedIds.has(r.id)).length;
  
  if (!mounted) {
    return (
      <Card>
        <CardHeader className="px-4 lg:px-6">
          <CardTitle className="text-base lg:text-lg flex items-center gap-2">
            <span>💡</span>
            Smart Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 lg:px-6 pb-4">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="px-4 lg:px-6">
        <CardTitle className="text-base lg:text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>💡</span>
            Smart Recommendations
          </div>
          <div className="flex gap-1.5">
            {criticalCount > 0 && (
              <Badge variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700 bg-yellow-50">
                {warningCount} warning
              </Badge>
            )}
            {infoCount > 0 && (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
                {infoCount} info
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 lg:px-6 pb-4">
        {visibleRecommendations.length > 0 ? (
          <div className="space-y-3">
            {visibleRecommendations.map(rec => {
              const styles = priorityStyles[rec.priority];
              
              return (
                <div
                  key={rec.id}
                  className={`p-3 lg:p-4 rounded-lg border ${styles.bg} ${styles.border} relative`}
                >
                  {/* Dismiss button */}
                  <button
                    onClick={() => handleDismiss(rec.id)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
                    title="Dismiss for 24 hours"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  
                  <div className="flex items-start gap-3 pr-6">
                    <span className="text-xl lg:text-2xl">{rec.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm lg:text-base text-gray-900">{rec.title}</span>
                        <Badge variant="outline" className={`text-xs ${styles.badge} ${styles.badgeBg} border-0`}>
                          {priorityLabels[rec.priority]}
                        </Badge>
                      </div>
                      <p className="text-xs lg:text-sm text-gray-600 mb-2">{rec.description}</p>
                      {rec.action && (
                        <a
                          href={rec.action.href}
                          className="inline-flex items-center gap-1 text-xs lg:text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          {rec.action.label}
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {allRecommendations.filter(r => !dismissedIds.has(r.id)).length > maxItems && (
              <div className="text-center pt-2">
                <span className="text-xs text-gray-500">
                  +{allRecommendations.filter(r => !dismissedIds.has(r.id)).length - maxItems} more recommendations
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 lg:py-8 text-gray-500">
            <span className="text-2xl mb-2 block">✨</span>
            All caught up! No recommendations at this time.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
