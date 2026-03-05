# Elliot Feldman - Email Health Monitor

Monitor email infrastructure health at scale. Built for high-volume cold email operations.

## Features

### 📊 Dashboard
- Real-time health overview of all sender emails
- Health distribution (healthy/warning/burned)
- Warmup status tracking
- Average reply rate monitoring
- Flagged domains alerts
- Recent issues feed

### 📧 Email Accounts
- Monitor 5,000+ sender emails
- Search and filter by status, warmup, domain
- Track reply rates vs average
- Identify burned accounts automatically
- Paginated view for scale

### 🌐 Domain Health
- SPF/DKIM/DMARC validation status
- Blacklist monitoring
- Spam score tracking
- Inbox placement rates
- Per-domain email breakdown

### 📅 Warmup Calendar
- Visual 30-day warmup schedule
- Track daily sending capacity progression
- Upcoming ready dates timeline
- Rotation planning

## Tech Stack

- **Frontend:** Next.js 16, React, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui
- **Hosting:** Railway

## Data Sources (planned)

- **Bison (LeadGenJay):** Email accounts, warmup status, reply rates
- **EmailGuard:** Spam scores, blacklist checks, inbox placement tests

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Environment Variables

```env
# Bison API (LeadGenJay)
BISON_API_KEY=your_api_key

# EmailGuard API
EMAILGUARD_API_KEY=your_api_key
```

## Architecture

```
src/
├── app/
│   ├── page.tsx          # Dashboard
│   ├── emails/page.tsx   # Email accounts list
│   ├── domains/page.tsx  # Domain health
│   └── warmup/page.tsx   # Warmup calendar
├── components/
│   ├── sidebar.tsx       # Navigation
│   └── ui/               # shadcn components
└── lib/
    └── mock-data.ts      # Mock data generator (5k emails)
```

## Roadmap

- [ ] Connect Bison API for real email data
- [ ] Connect EmailGuard API for domain health
- [ ] Hourly sync background jobs
- [ ] Email alerts for burned accounts
- [ ] Historical trend charts
- [ ] Export functionality

---

Built for Elliot Feldman by LeadGenJay 🦾
