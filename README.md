# Elliot Feldman - Email Health Monitor

Monitor email infrastructure health at scale. Built for high-volume cold email operations with 5,000+ sender accounts.

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Emails](https://img.shields.io/badge/emails-5000+-blue)

**Live Demo:** https://elliot-feldman-production.up.railway.app

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
- Mobile card layout for easy browsing

### 🌐 Domain Health
- SPF/DKIM/DMARC validation status
- Blacklist monitoring via EmailGuard
- Spam score tracking
- Inbox placement rates
- Per-domain email breakdown

### 📅 Warmup Calendar
- Visual 30-day warmup schedule
- Track daily sending capacity progression
- Upcoming ready dates timeline
- Rotation planning

### ⚙️ Settings
- API key configuration (Bison + EmailGuard)
- Connection testing
- Secure client-side storage

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui
- **APIs:** Bison (LeadGenJay), EmailGuard
- **Hosting:** Railway

## API Integrations

### Bison (LeadGenJay)
- Sender email accounts & warmup status
- Reply rates & campaign statistics
- Workspace metrics

### EmailGuard
- Domain blacklist monitoring
- SPF/DKIM/DMARC lookups
- Content spam checking
- Inbox placement tests
- DMARC reports

## Getting Started

```bash
# Clone the repo
git clone https://github.com/jonathangetonapod/elliot-feldman.git
cd elliot-feldman

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

Or configure via the Settings page in the app.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Dashboard
│   ├── emails/page.tsx       # Email accounts list
│   ├── domains/page.tsx      # Domain health
│   ├── warmup/page.tsx       # Warmup calendar
│   ├── settings/page.tsx     # API key settings
│   └── api/
│       ├── bison/route.ts    # Bison API proxy
│       └── emailguard/route.ts # EmailGuard API proxy
├── components/
│   ├── sidebar.tsx           # Navigation (mobile hamburger)
│   └── ui/                   # shadcn components
└── lib/
    ├── bison-api.ts          # Bison API client
    ├── emailguard-api.ts     # EmailGuard API client
    ├── mock-data.ts          # Mock data (5k emails)
    └── utils.ts              # Utilities
```

## Mobile Optimized 📱

- Responsive hamburger menu
- Card layouts for data on small screens
- Touch-friendly buttons and spacing
- Stacked filters on narrow screens

## Roadmap

- [x] Dashboard with health overview
- [x] Email accounts list with filters
- [x] Domain health monitoring
- [x] Warmup calendar
- [x] Settings page for API keys
- [x] Bison API integration
- [x] EmailGuard API integration
- [x] Mobile responsive design
- [ ] Connect real data to views
- [ ] Hourly sync background jobs
- [ ] Email alerts for burned accounts
- [ ] Historical trend charts
- [ ] Export functionality

## API Documentation

- **Bison (LeadGenJay):** Internal API
- **EmailGuard:** https://app.emailguard.io/api/reference

---

Built for Elliot Feldman by LeadGenJay 🦾
