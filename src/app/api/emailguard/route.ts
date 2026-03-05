/**
 * EmailGuard API proxy route.
 * 
 * Proxies requests to EmailGuard API to avoid exposing API key to client.
 * 
 * Usage:
 *   POST /api/emailguard
 *   Body: { action: string, ...params }
 * 
 * Actions:
 *   - blacklist-status: Get monitored domain blacklist status
 *   - blacklist-adhoc: Run ad-hoc blacklist check
 *   - spf-lookup: SPF record lookup
 *   - dkim-lookup: DKIM record lookup  
 *   - dmarc-lookup: DMARC record lookup
 *   - spam-check: Content spam check
 *   - inbox-tests: List inbox placement tests
 *   - inbox-test-get: Get specific inbox placement test
 *   - inbox-test-create: Create new inbox placement test
 *   - domain-health: Comprehensive domain health check
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  EmailGuardClient,
  checkDomainHealth,
  type AdHocBlacklistRequest,
  type CreateInboxPlacementTestRequest,
} from '@/lib/emailguard-api';

// Get API key from environment
const EMAILGUARD_API_KEY = process.env.EMAILGUARD_API_KEY;

interface ProxyRequest {
  action: string;
  // Blacklist
  page?: number;
  per_page?: number;
  domain?: string;
  ip?: string;
  // DKIM
  selector?: string;
  // Spam check
  content?: string;
  // Inbox placement
  id?: string;
  name?: string;
  from_email?: string;
  subject?: string;
  body?: string;
  // Domain health
  dkimSelector?: string;
  checkBlacklist?: boolean;
}

export async function POST(request: NextRequest) {
  // Check for API key
  if (!EMAILGUARD_API_KEY) {
    return NextResponse.json(
      { error: 'EmailGuard API key not configured' },
      { status: 500 }
    );
  }

  let body: ProxyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { action } = body;

  if (!action) {
    return NextResponse.json(
      { error: 'Missing action parameter' },
      { status: 400 }
    );
  }

  const client = new EmailGuardClient(EMAILGUARD_API_KEY);

  try {
    switch (action) {
      // ========================================
      // Blacklist Checks
      // ========================================
      case 'blacklist-status': {
        const result = await client.getBlacklistStatus({
          page: body.page,
          per_page: body.per_page,
        });
        return NextResponse.json(result);
      }

      case 'blacklist-adhoc': {
        if (!body.domain) {
          return NextResponse.json(
            { error: 'Missing domain parameter' },
            { status: 400 }
          );
        }
        const data: AdHocBlacklistRequest = {
          domain: body.domain,
          ip: body.ip,
        };
        const result = await client.runAdHocBlacklistCheck(data);
        return NextResponse.json(result);
      }

      // ========================================
      // Email Authentication
      // ========================================
      case 'spf-lookup': {
        if (!body.domain) {
          return NextResponse.json(
            { error: 'Missing domain parameter' },
            { status: 400 }
          );
        }
        const result = await client.lookupSPF(body.domain);
        return NextResponse.json(result);
      }

      case 'dkim-lookup': {
        if (!body.domain || !body.selector) {
          return NextResponse.json(
            { error: 'Missing domain or selector parameter' },
            { status: 400 }
          );
        }
        const result = await client.lookupDKIM(body.domain, body.selector);
        return NextResponse.json(result);
      }

      case 'dmarc-lookup': {
        if (!body.domain) {
          return NextResponse.json(
            { error: 'Missing domain parameter' },
            { status: 400 }
          );
        }
        const result = await client.lookupDMARC(body.domain);
        return NextResponse.json(result);
      }

      // ========================================
      // Content Spam Check
      // ========================================
      case 'spam-check': {
        if (!body.content) {
          return NextResponse.json(
            { error: 'Missing content parameter' },
            { status: 400 }
          );
        }
        const result = await client.checkContentSpam(body.content);
        return NextResponse.json(result);
      }

      // ========================================
      // Inbox Placement Tests
      // ========================================
      case 'inbox-tests': {
        const result = await client.getInboxPlacementTests({
          page: body.page,
          per_page: body.per_page,
        });
        return NextResponse.json(result);
      }

      case 'inbox-test-get': {
        if (!body.id) {
          return NextResponse.json(
            { error: 'Missing id parameter' },
            { status: 400 }
          );
        }
        const result = await client.getInboxPlacementTest(body.id);
        return NextResponse.json(result);
      }

      case 'inbox-test-create': {
        if (!body.from_email || !body.subject || !body.body) {
          return NextResponse.json(
            { error: 'Missing from_email, subject, or body parameter' },
            { status: 400 }
          );
        }
        const data: CreateInboxPlacementTestRequest = {
          name: body.name,
          from_email: body.from_email,
          subject: body.subject,
          body: body.body,
        };
        const result = await client.createInboxPlacementTest(data);
        return NextResponse.json(result);
      }

      // ========================================
      // Composite Actions
      // ========================================
      case 'domain-health': {
        if (!body.domain) {
          return NextResponse.json(
            { error: 'Missing domain parameter' },
            { status: 400 }
          );
        }
        const result = await checkDomainHealth(EMAILGUARD_API_KEY, body.domain, {
          dkimSelector: body.dkimSelector,
          checkBlacklist: body.checkBlacklist,
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('EmailGuard API error:', error);
    
    // Handle structured API errors
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
      const apiError = error as { status: number; message: string; details?: unknown };
      return NextResponse.json(
        { 
          error: apiError.message,
          details: apiError.details,
        },
        { status: apiError.status }
      );
    }
    
    // Handle generic errors
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'emailguard-proxy',
    configured: !!EMAILGUARD_API_KEY,
    actions: [
      'blacklist-status',
      'blacklist-adhoc',
      'spf-lookup',
      'dkim-lookup',
      'dmarc-lookup',
      'spam-check',
      'inbox-tests',
      'inbox-test-get',
      'inbox-test-create',
      'domain-health',
    ],
  });
}
