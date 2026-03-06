import { NextRequest, NextResponse } from 'next/server';

/**
 * Weekly Warmup History API
 *
 * Fetches warmup stats for a specific email in weekly increments.
 * Uses the sender-emails/{id} endpoint to get created_at date,
 * then fetches weekly warmup data from creation date to today.
 *
 * GET /api/bison/warmup/history?email=user@domain.com
 * GET /api/bison/warmup/history?email=user@domain.com&id=123
 */

const BISON_BASE_URL = 'https://send.leadgenjay.com/api';
const BATCH_SIZE = 16; // 3k req/min limit — fetch all weeks at once

interface SenderEmailDetails {
  id: number;
  email: string;
  name?: string;
  created_at: string;
  warmup_enabled: boolean;
  daily_limit: number;
  emails_sent_count: number;
  total_replied_count: number;
  unique_replied_count: number;
  total_opened_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  total_leads_contacted_count: number;
  interested_leads_count: number;
  status: string;
  tags?: { id: number; name: string }[];
}

interface WarmupSenderEmail {
  id: number;
  email: string;
  name?: string;
  warmup_emails_sent?: number;
  warmup_replies_received?: number;
  warmup_score?: number;
  warmup_bounces_received_count?: number;
  warmup_bounces_caused_count?: number;
  warmup_emails_saved_from_spam?: number;
  warmup_enabled?: boolean;
  daily_limit?: number;
  created_at?: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatWeekLabel(start: Date, end: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[start.getMonth()]} ${start.getDate()} – ${monthNames[end.getMonth()]} ${end.getDate()}`;
}

// Fetch account details using the sender-emails/{id} endpoint
async function fetchAccountDetails(
  apiKey: string,
  emailOrId: string
): Promise<SenderEmailDetails | null> {
  const url = `${BISON_BASE_URL}/sender-emails/${encodeURIComponent(emailOrId)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Sender email details API error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    return result.data || null;
  } catch (err) {
    console.error('Error fetching account details:', err);
    return null;
  }
}

// Fetch all pages for a single week's date range and find the specific email
async function fetchWeekForEmail(
  apiKey: string,
  startDate: string,
  endDate: string,
  targetEmail: string
): Promise<WarmupSenderEmail | null> {
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const url = `${BISON_BASE_URL}/warmup/sender-emails?page=${page}&start_date=${startDate}&end_date=${endDate}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Warmup history API error for ${startDate}-${endDate}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const emails: WarmupSenderEmail[] = data.data || [];

      const match = emails.find(e => e.email.toLowerCase() === targetEmail.toLowerCase());
      if (match) return match;

      const totalPages = data.meta?.last_page || 1;
      if (page >= totalPages) break;
      page++;
    } catch (err) {
      console.error(`Error fetching warmup page ${page} for ${startDate}-${endDate}:`, err);
      return null;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const headerApiKey = request.headers.get('X-Bison-Api-Key');
  const apiKey = headerApiKey || process.env.BISON_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No API key provided.' },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const email = searchParams.get('email');
  const accountId = searchParams.get('id');

  if (!email) {
    return NextResponse.json(
      { error: 'email parameter is required' },
      { status: 400 }
    );
  }

  try {
    const startTime = Date.now();
    const now = new Date();

    // Step 1: Fetch account details to get created_at
    let accountDetails: SenderEmailDetails | null = null;
    if (accountId) {
      accountDetails = await fetchAccountDetails(apiKey, accountId);
    }
    // Fallback: try fetching by email address
    if (!accountDetails) {
      accountDetails = await fetchAccountDetails(apiKey, email);
    }

    // Determine start date: from created_at or default 12 weeks back
    let historyStartDate: Date;
    if (accountDetails?.created_at) {
      historyStartDate = new Date(accountDetails.created_at);
    } else {
      historyStartDate = new Date(now);
      historyStartDate.setDate(historyStartDate.getDate() - 84); // 12 weeks fallback
    }

    // Calculate number of weeks from creation to now
    const msSinceCreation = now.getTime() - historyStartDate.getTime();
    const daysSinceCreation = Math.floor(msSinceCreation / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.min(Math.max(Math.ceil(daysSinceCreation / 7), 1), 16); // Cap at 16 weeks

    // Build weekly date ranges from creation date forward
    const weekRanges: { start: Date; end: Date; label: string }[] = [];
    for (let i = 0; i < totalWeeks; i++) {
      const start = new Date(historyStartDate);
      start.setDate(start.getDate() + (i * 7));

      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      // Don't go past today
      if (start > now) break;
      if (end > now) {
        end.setTime(now.getTime());
      }

      weekRanges.push({
        start,
        end,
        label: formatWeekLabel(start, end),
      });
    }

    // Fetch weeks in parallel batches
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

    const weeklyData: WeeklyDataPoint[] = [];

    for (let i = 0; i < weekRanges.length; i += BATCH_SIZE) {
      const batch = weekRanges.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(range =>
          fetchWeekForEmail(
            apiKey,
            formatDate(range.start),
            formatDate(range.end),
            email
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const range = batch[j];
        const result = batchResults[j];

        const sent = result?.warmup_emails_sent ?? 0;
        const replies = result?.warmup_replies_received ?? 0;
        const replyRate = sent > 0 ? (replies / sent) * 100 : 0;

        weeklyData.push({
          week: i + j + 1,
          label: range.label,
          startDate: formatDate(range.start),
          endDate: formatDate(range.end),
          warmupReplyRate: Math.round(replyRate * 100) / 100,
          warmupEmailsSent: sent,
          warmupRepliesReceived: replies,
          warmupScore: result?.warmup_score ?? 0,
          warmupBounces: result?.warmup_bounces_received_count ?? 0,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Fetched ${weeklyData.length}-week history for ${email} (since ${accountDetails?.created_at || 'unknown'}) in ${duration}ms`);

    return NextResponse.json({
      email,
      accountDetails: accountDetails ? {
        id: accountDetails.id,
        name: accountDetails.name,
        email: accountDetails.email,
        createdAt: accountDetails.created_at,
        warmupEnabled: accountDetails.warmup_enabled,
        dailyLimit: accountDetails.daily_limit,
        status: accountDetails.status,
        emailsSent: accountDetails.emails_sent_count,
        totalReplies: accountDetails.total_replied_count,
        uniqueReplies: accountDetails.unique_replied_count,
        totalOpened: accountDetails.total_opened_count,
        bounced: accountDetails.bounced_count,
        unsubscribed: accountDetails.unsubscribed_count,
        leadsContacted: accountDetails.total_leads_contacted_count,
        interestedLeads: accountDetails.interested_leads_count,
        tags: accountDetails.tags,
      } : null,
      weeks: weeklyData,
      meta: {
        totalWeeks: weeklyData.length,
        createdAt: accountDetails?.created_at || null,
        daysSinceCreation,
        fetchDuration: duration,
      },
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Warmup history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch warmup history', details: String(error) },
      { status: 500 }
    );
  }
}
