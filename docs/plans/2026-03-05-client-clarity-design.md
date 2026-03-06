# Client Clarity System Design

## Goal
Make every metric in the dashboard self-explanatory for Elliot Feldman. He should never need to ask what something means, what's good/bad, or what to do about it.

## Components

### 1. InfoTooltip Component
Reusable `<InfoTooltip text="..." />` that renders a small `?` icon. On hover/tap shows plain-English explanation. Used next to every metric label.

### 2. Emails Page (`/emails`)
- Column headers get tooltips:
  - WU Reply Rate: "% of warmup emails that got replies. Healthy: 20-40%. Below 10%: concern."
  - Burn Risk: "Predicts if account is losing reputation. Based on warmup reply rate dropping week-over-week."
  - WU Score: "Overall warmup health score from Bison. Higher = better. Drops indicate deliverability issues."
  - Bounces: "Warmup emails that bounced back. Rising bounces = bad sign for domain reputation."
  - Sparkline: "Mini chart showing warmup reply rate trend over time."
- Burn risk section gets intro: "Accounts where warmup reply rate is dropping significantly. This usually means the email provider is starting to distrust this account."
- At-risk accounts get action text: "Consider pausing sending from this account" / "This domain may need to be rotated"
- Avg WU Reply card: add benchmark "(healthy: 20-40%)"
- Page subtitle: "Monitor warmup health for all sender emails. Warmup reply rate measures how well each account is being received by email providers."

### 3. Home/Accounts Page (`/`)
- Subtitle: "Quick overview of which accounts need attention based on warmup reply rate changes."
- Each summary card gets a one-liner:
  - Needs Action: "Warmup reply rate dropped >30% — these accounts may be burning out"
  - Watch: "Warmup reply rate dropped 10-30% — keep an eye on these"
  - Healthy: "Warmup reply rate is stable or improving"
- Add benchmark to reply rate display

### 4. Domains Page (`/domains`)
- Subtitle: "Check that your sending domains are properly configured and not blacklisted."
- SPF/DKIM/DMARC tooltips:
  - SPF: "Sender Policy Framework — tells email providers which servers can send email from your domain. Must be valid."
  - DKIM: "DomainKeys Identified Mail — adds a digital signature to verify emails aren't tampered with. Must be valid."
  - DMARC: "Domain-based Message Authentication — tells providers what to do with emails that fail SPF/DKIM checks. Must be valid."
- Spam score benchmark: "1-3: Good. 4-6: Watch. 7-10: Critical."
- Blacklist: "Your domain appears on X email blacklists. This means some email providers may reject or spam-folder your emails. Contact your account manager to request delisting."
- Inbox placement: "% of emails that land in the inbox (not spam). Target: >90%."

### 5. Warmup Page (`/warmup`)
- Add intro paragraph: "New email accounts need a 30-day warmup period before sending at full volume. During warmup, Bison gradually increases sending volume so email providers learn to trust the account. Skipping or rushing warmup leads to emails landing in spam."
- Status explanations:
  - Ready: "This account has completed warmup and can send at full volume."
  - Warming: "This account is still building reputation. Don't send campaigns from it yet."
  - Paused: "Warmup is paused — the account is not building reputation."
- Daily limit stages explained: "5/day (Days 1-5) → 10/day (Days 6-10) → 20/day (Days 11-20) → 35/day (Days 21-29) → 50/day (Day 30+, ready!)"

### 6. Alerts Page (`/alerts`)
- Each alert type gets "Recommended action":
  - Reply rate critical: "This account's warmup reply rate is dangerously low. Pause sending and investigate the domain."
  - Reply rate warning: "Reply rate is declining. Monitor for another few days — if it continues, consider pausing."
  - Domain blacklisted: "This domain is on an email blacklist. Stop sending from it and request delisting."
  - Warmup complete: "Good news! This account is ready for full-volume sending."
- "Resolve" button: add subtitle "(marks as handled — does not fix the underlying issue)"
- "Dismiss" button: add subtitle "(hides this alert permanently)"

## Implementation
- Create `src/components/info-tooltip.tsx`
- Update each page file to add tooltips, subtitles, and action guidance
- No structural changes to existing layouts — additive only
