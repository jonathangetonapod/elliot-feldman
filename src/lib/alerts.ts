// Alert detection logic for account health monitoring

import { SenderEmail, DomainHealth } from './mock-data';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  type: 'reply_rate_critical' | 'reply_rate_warning' | 'reply_rate_declining' | 'domain_blacklisted' | 'warmup_complete';
  message: string;
  entity: string; // email address or domain name
  entityType: 'email' | 'domain';
  timestamp: Date;
  resolved: boolean;
}

// Thresholds
const CRITICAL_REPLY_RATE = 0.5; // Below 0.5% is critical
const WARNING_REPLY_RATE = 1.0;  // Below 1% is warning

/**
 * Generate alerts based on email accounts and domain health
 */
export function generateAlerts(emails: SenderEmail[], domains: DomainHealth[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  // Check each email for reply rate issues
  emails.forEach((email) => {
    // Only check emails that have some sending history
    if (email.sentLast7Days < 10) return;

    // Critical: Below 0.5% reply rate
    if (email.replyRate < CRITICAL_REPLY_RATE) {
      alerts.push({
        id: `critical-reply-${email.id}`,
        severity: 'critical',
        type: 'reply_rate_critical',
        message: `Account reply rate critically low at ${email.replyRate}%`,
        entity: email.email,
        entityType: 'email',
        timestamp: new Date(email.lastSyncedAt || now),
        resolved: false,
      });
    }
    // Warning: Below 1% reply rate
    else if (email.replyRate < WARNING_REPLY_RATE) {
      alerts.push({
        id: `warning-reply-${email.id}`,
        severity: 'warning',
        type: 'reply_rate_warning',
        message: `Account reply rate below threshold at ${email.replyRate}%`,
        entity: email.email,
        entityType: 'email',
        timestamp: new Date(email.lastSyncedAt || now),
        resolved: false,
      });
    }

    // Warning: Reply rate declining (below average)
    if (email.replyRate < email.avgReplyRate * 0.7 && email.replyRate >= WARNING_REPLY_RATE) {
      alerts.push({
        id: `declining-reply-${email.id}`,
        severity: 'warning',
        type: 'reply_rate_declining',
        message: `Reply rate declining: ${email.replyRate}% vs avg ${email.avgReplyRate}%`,
        entity: email.email,
        entityType: 'email',
        timestamp: new Date(email.lastSyncedAt || now),
        resolved: false,
      });
    }

    // Info: Warmup complete, ready to scale
    if (email.warmupStatus === 'ready' && email.warmupDay >= 30 && email.status === 'healthy') {
      alerts.push({
        id: `warmup-complete-${email.id}`,
        severity: 'info',
        type: 'warmup_complete',
        message: 'Warmup complete - ready to scale sending volume',
        entity: email.email,
        entityType: 'email',
        timestamp: new Date(email.lastSyncedAt || now),
        resolved: false,
      });
    }
  });

  // Check each domain for blacklist issues
  domains.forEach((domain) => {
    if (domain.blacklistStatus === 'listed') {
      alerts.push({
        id: `blacklist-${domain.domain}`,
        severity: 'critical',
        type: 'domain_blacklisted',
        message: `Domain blacklisted on ${domain.blacklistCount} list${domain.blacklistCount > 1 ? 's' : ''}`,
        entity: domain.domain,
        entityType: 'domain',
        timestamp: new Date(domain.lastCheckedAt || now),
        resolved: false,
      });
    }
  });

  // Sort by severity (critical first) then by timestamp (newest first)
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  alerts.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  return alerts;
}

/**
 * Get count of alerts by severity
 */
export function getAlertCounts(alerts: Alert[]): { critical: number; warning: number; info: number; total: number } {
  const unresolved = alerts.filter(a => !a.resolved);
  return {
    critical: unresolved.filter(a => a.severity === 'critical').length,
    warning: unresolved.filter(a => a.severity === 'warning').length,
    info: unresolved.filter(a => a.severity === 'info').length,
    total: unresolved.length,
  };
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    case 'info': return '🟢';
  }
}

/**
 * Get severity color classes
 */
export function getSeverityClasses(severity: AlertSeverity): { bg: string; border: string; text: string } {
  switch (severity) {
    case 'critical':
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' };
    case 'warning':
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' };
    case 'info':
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' };
  }
}
