import { NextRequest, NextResponse } from 'next/server';

/**
 * Warmup Stats API Proxy Route
 * 
 * Proxies requests to the Bison warmup/sender-emails endpoint with date range support.
 * Returns warmup statistics for all accounts within a specified period.
 * 
 * Endpoint: GET /api/warmup/sender-emails?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * 
 * Returns per account:
 * - warmup_emails_sent
 * - warmup_replies_received
 * - warmup_emails_saved_from_spam
 * - warmup_score
 * - warmup_bounces_received_count
 * - warmup_bounces_caused_count
 */

const BISON_BASE_URL = 'https://send.leadgenjay.com/api';
const PARALLEL_BATCH_SIZE = 10;

interface WarmupSenderEmail {
  id: number;
  email: string;
  name?: string;
  warmup_emails_sent?: number;
  warmup_replies_received?: number;
  warmup_emails_saved_from_spam?: number;
  warmup_score?: number;
  warmup_bounces_received_count?: number;
  warmup_bounces_caused_count?: number;
  warmup_enabled?: boolean;
  daily_limit?: number;
  created_at?: string;
}

interface WarmupStatsResponse {
  data: WarmupSenderEmail[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

// Fetch a single page of warmup sender emails with date range
async function fetchWarmupPage(
  apiKey: string, 
  page: number,
  startDate: string,
  endDate: string
): Promise<WarmupStatsResponse> {
  const url = `${BISON_BASE_URL}/warmup/sender-emails?page=${page}&start_date=${startDate}&end_date=${endDate}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Bison Warmup API error: ${response.status}`);
  }
  
  return response.json();
}

// Fetch all pages of warmup stats with PARALLEL processing
async function fetchAllWarmupStats(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<{ data: WarmupSenderEmail[], meta: any }> {
  // First, get page 1 to know total pages
  const firstPage = await fetchWarmupPage(apiKey, 1, startDate, endDate);
  const totalPages = firstPage.meta?.last_page || 1;
  const allEmails: WarmupSenderEmail[] = [...(firstPage.data || [])];
  
  if (totalPages <= 1) {
    return {
      data: allEmails,
      meta: {
        total: allEmails.length,
        current_page: 1,
        last_page: 1,
        per_page: allEmails.length,
        start_date: startDate,
        end_date: endDate,
      }
    };
  }
  
  // Fetch remaining pages in parallel batches
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  
  for (let i = 0; i < remainingPages.length; i += PARALLEL_BATCH_SIZE) {
    const batch = remainingPages.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(page => fetchWarmupPage(apiKey, page, startDate, endDate).catch(err => {
        console.error(`Failed to fetch warmup page ${page}:`, err);
        return { data: [] as WarmupSenderEmail[], meta: undefined };
      }))
    );
    
    for (const result of batchResults) {
      allEmails.push(...(result.data || []));
    }
  }
  
  return {
    data: allEmails,
    meta: {
      total: allEmails.length,
      current_page: 1,
      last_page: 1,
      per_page: allEmails.length,
      start_date: startDate,
      end_date: endDate,
    }
  };
}

// Helper to format date for API
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Calculate date ranges for comparison
function getComparisonPeriods(periodType: string = 'default'): {
  current: { start: string; end: string };
  baseline: { start: string; end: string };
} {
  const now = new Date();
  
  switch (periodType) {
    case '7vs7': {
      // Last 7 days vs previous 7 days
      const currentEnd = new Date(now);
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      
      const baselineEnd = new Date(currentStart);
      baselineEnd.setDate(baselineEnd.getDate() - 1);
      const baselineStart = new Date(baselineEnd);
      baselineStart.setDate(baselineStart.getDate() - 7);
      
      return {
        current: { start: formatDate(currentStart), end: formatDate(currentEnd) },
        baseline: { start: formatDate(baselineStart), end: formatDate(baselineEnd) },
      };
    }
    case '14vs14': {
      // Last 14 days vs previous 14 days
      const currentEnd = new Date(now);
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 14);
      
      const baselineEnd = new Date(currentStart);
      baselineEnd.setDate(baselineEnd.getDate() - 1);
      const baselineStart = new Date(baselineEnd);
      baselineStart.setDate(baselineStart.getDate() - 14);
      
      return {
        current: { start: formatDate(currentStart), end: formatDate(currentEnd) },
        baseline: { start: formatDate(baselineStart), end: formatDate(baselineEnd) },
      };
    }
    case '30vs30': {
      // Last 30 days vs previous 30 days
      const currentEnd = new Date(now);
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 30);
      
      const baselineEnd = new Date(currentStart);
      baselineEnd.setDate(baselineEnd.getDate() - 1);
      const baselineStart = new Date(baselineEnd);
      baselineStart.setDate(baselineStart.getDate() - 30);
      
      return {
        current: { start: formatDate(currentStart), end: formatDate(currentEnd) },
        baseline: { start: formatDate(baselineStart), end: formatDate(baselineEnd) },
      };
    }
    case '7vs14':
    default: {
      // Default: Last 7 days vs previous 7 days (changed from 7vs14)
      const currentEnd = new Date(now);
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      
      const baselineEnd = new Date(currentStart);
      baselineEnd.setDate(baselineEnd.getDate() - 1);
      const baselineStart = new Date(baselineEnd);
      baselineStart.setDate(baselineStart.getDate() - 7);
      
      return {
        current: { start: formatDate(currentStart), end: formatDate(currentEnd) },
        baseline: { start: formatDate(baselineStart), end: formatDate(baselineEnd) },
      };
    }
  }
}

export async function GET(request: NextRequest) {
  // Check for API key from header first (client-provided), then fall back to env var
  const headerApiKey = request.headers.get('X-Bison-Api-Key');
  const apiKey = headerApiKey || process.env.BISON_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No API key provided. Set BISON_API_KEY env var or pass X-Bison-Api-Key header' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const periodType = searchParams.get('period') || '7vs14';
  const compareMode = searchParams.get('compare') === 'true';
  
  // Allow custom date ranges
  const customStartDate = searchParams.get('start_date');
  const customEndDate = searchParams.get('end_date');
  
  try {
    const startTime = Date.now();
    
    // If custom dates provided, fetch just that range
    if (customStartDate && customEndDate) {
      const data = await fetchAllWarmupStats(apiKey, customStartDate, customEndDate);
      const duration = Date.now() - startTime;
      console.log(`Fetched ${data.data.length} warmup stats for ${customStartDate} to ${customEndDate} in ${duration}ms`);
      
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        },
      });
    }
    
    // Get comparison periods based on period type
    const periods = getComparisonPeriods(periodType);
    
    // Fetch current period
    const currentData = await fetchAllWarmupStats(
      apiKey, 
      periods.current.start, 
      periods.current.end
    );
    
    // If compare mode, also fetch baseline period
    let baselineData: { data: WarmupSenderEmail[], meta: any } | null = null;
    if (compareMode) {
      baselineData = await fetchAllWarmupStats(
        apiKey,
        periods.baseline.start,
        periods.baseline.end
      );
    }
    
    const duration = Date.now() - startTime;
    console.log(`Fetched warmup stats (compare=${compareMode}) in ${duration}ms`);
    
    // Build comparison data if baseline was fetched
    let comparisonData = null;
    if (baselineData) {
      // Create a map for quick lookup
      const baselineMap = new Map<string, WarmupSenderEmail>();
      for (const email of baselineData.data) {
        baselineMap.set(email.email, email);
      }
      
      // Build comparison for each account
      comparisonData = currentData.data.map(current => {
        const baseline = baselineMap.get(current.email);
        
        // Calculate changes
        const currentScore = current.warmup_score ?? 0;
        const baselineScore = baseline?.warmup_score ?? currentScore;
        const scoreChange = baselineScore > 0 
          ? ((currentScore - baselineScore) / baselineScore) * 100 
          : 0;
        
        // REPLY RATE CALCULATION - This is what matters for burn prediction!
        const currentSent = current.warmup_emails_sent ?? 0;
        const currentReplies = current.warmup_replies_received ?? 0;
        const currentReplyRate = currentSent > 0 ? (currentReplies / currentSent) * 100 : 0;
        
        const baselineSent = baseline?.warmup_emails_sent ?? 0;
        const baselineReplies = baseline?.warmup_replies_received ?? 0;
        const baselineReplyRate = baselineSent > 0 ? (baselineReplies / baselineSent) * 100 : 0;
        
        // Reply rate change - positive = improving, negative = declining
        const replyRateChange = baselineReplyRate > 0
          ? ((currentReplyRate - baselineReplyRate) / baselineReplyRate) * 100
          : 0;
        
        const currentBounces = current.warmup_bounces_received_count ?? 0;
        const baselineBounces = baseline?.warmup_bounces_received_count ?? 0;
        const bouncesChange = currentBounces - baselineBounces;
        
        // Determine health status based on REPLY RATE changes (not warmup score!)
        // Burn Risk = Reply Rate dropping drastically week over week
        let health: 'declining' | 'warning' | 'stable' | 'improving' | 'new';
        if (!baseline || baselineReplyRate === 0) {
          health = 'new';
        } else if (replyRateChange <= -50) {
          // Critical: Reply rate dropped >50% week over week
          health = 'declining';
        } else if (replyRateChange <= -30) {
          // High/Warning: Reply rate dropped 30-50% week over week
          health = 'warning';
        } else if (replyRateChange >= 30) {
          // Improving: Reply rate increased >30%
          health = 'improving';
        } else {
          // Stable: Within ±30% of baseline
          health = 'stable';
        }
        
        return {
          id: current.id,
          email: current.email,
          name: current.name,
          warmup_enabled: current.warmup_enabled,
          daily_limit: current.daily_limit,
          created_at: current.created_at,
          
          // Current period stats
          current: {
            warmup_score: currentScore,
            warmup_emails_sent: currentSent,
            warmup_replies_received: currentReplies,
            warmup_reply_rate: Math.round(currentReplyRate * 100) / 100,
            warmup_emails_saved_from_spam: current.warmup_emails_saved_from_spam ?? 0,
            warmup_bounces_received_count: currentBounces,
            warmup_bounces_caused_count: current.warmup_bounces_caused_count ?? 0,
          },
          
          // Baseline period stats (if available)
          baseline: baseline ? {
            warmup_score: baselineScore,
            warmup_emails_sent: baselineSent,
            warmup_replies_received: baselineReplies,
            warmup_reply_rate: Math.round(baselineReplyRate * 100) / 100,
            warmup_emails_saved_from_spam: baseline.warmup_emails_saved_from_spam ?? 0,
            warmup_bounces_received_count: baselineBounces,
            warmup_bounces_caused_count: baseline.warmup_bounces_caused_count ?? 0,
          } : null,
          
          // Calculated changes - REPLY RATE is the key metric!
          changes: {
            warmup_score: Math.round(scoreChange * 10) / 10,
            warmup_reply_rate: Math.round(replyRateChange * 10) / 10,
            warmup_replies_received: baselineReplies > 0
              ? Math.round(((currentReplies - baselineReplies) / baselineReplies) * 100 * 10) / 10
              : 0,
            warmup_bounces_received_count: bouncesChange,
          },
          
          // Health classification based on reply rate
          health,
        };
      });
    }
    
    return NextResponse.json({
      data: compareMode ? comparisonData : currentData.data,
      meta: {
        ...currentData.meta,
        periods: {
          current: periods.current,
          baseline: compareMode ? periods.baseline : null,
        },
        periodType,
        compareMode,
      },
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Warmup API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warmup stats from Bison API', details: String(error) },
      { status: 500 }
    );
  }
}
