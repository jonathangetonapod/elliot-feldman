"use client";

import { useMemo, useEffect, useState } from 'react';
import { useBisonData } from './use-bison-data';
import { generateMockEmails, getMockDomainHealth } from './mock-data';
import { generateAlerts, getAlertCounts } from './alerts';

export function useAlertCounts() {
  const { emails: bisonEmails, domains: bisonDomains, connected, error, loading } = useBisonData();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  
  // Load dismissed state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('elliot-feldman-dismissed-alerts');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setDismissedIds(new Set(parsed.dismissed || []));
          setResolvedIds(new Set(parsed.resolved || []));
        } catch (e) {
          // ignore
        }
      }
    }
  }, []);
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || loading;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  const domains = useMockData ? getMockDomainHealth() : bisonDomains;
  
  // Generate alerts and filter out dismissed/resolved ones
  const counts = useMemo(() => {
    const allAlerts = generateAlerts(emails, domains);
    const activeAlerts = allAlerts.filter(a => !dismissedIds.has(a.id) && !resolvedIds.has(a.id));
    return getAlertCounts(activeAlerts);
  }, [emails, domains, dismissedIds, resolvedIds]);
  
  return { counts, loading };
}
