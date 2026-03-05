// Mock data generator for Elliot Feldman email monitoring app
// Simulates 5,000 sender emails across multiple domains

const DOMAINS = [
  'elliotfeldman.com', 'feldmangroup.io', 'efcapital.co', 'feldmanadvisors.com',
  'elliotf.io', 'feldmanventures.com', 'efholdings.co', 'feldmanpartners.io',
  'elliotfeldman.co', 'feldmancap.com', 'efadvisory.io', 'feldmanequity.com',
  'elliotgroup.co', 'feldmaninvest.io', 'efwealth.com', 'feldmanassets.co',
  'elliotcapital.io', 'feldmanfund.com', 'efpartners.co', 'feldmanmgmt.io'
];

const FIRST_NAMES = ['James', 'Michael', 'Robert', 'David', 'William', 'John', 'Richard', 'Thomas', 'Charles', 'Daniel', 
  'Matthew', 'Anthony', 'Mark', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian',
  'Sarah', 'Jennifer', 'Lisa', 'Michelle', 'Emily', 'Jessica', 'Amanda', 'Ashley', 'Stephanie', 'Nicole'];

const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris'];

export type EmailStatus = 'healthy' | 'warning' | 'burned';
export type WarmupStatus = 'warming' | 'ready' | 'paused';

export interface SenderEmail {
  id: number;
  email: string;
  name: string;
  domain: string;
  status: EmailStatus;
  warmupStatus: WarmupStatus;
  warmupDay: number;
  warmupReadyDate: string;
  dailyLimit: number;
  currentVolume: number;
  replyRate: number;
  avgReplyRate: number;
  sentLast7Days: number;
  repliesLast7Days: number;
  lastSyncedAt: string;
}

export interface DomainHealth {
  domain: string;
  totalEmails: number;
  healthyEmails: number;
  warningEmails: number;
  burnedEmails: number;
  spamScore: number;
  blacklistStatus: 'clean' | 'listed';
  blacklistCount: number;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  inboxPlacementRate: number;
  lastCheckedAt: string;
}

export interface DashboardStats {
  totalEmails: number;
  healthyEmails: number;
  warningEmails: number;
  burnedEmails: number;
  totalDomains: number;
  flaggedDomains: number;
  avgReplyRate: number;
  warmingEmails: number;
  readyEmails: number;
}

// Seeded random for consistent mock data
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

const random = seededRandom(42);

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function generateEmail(id: number): SenderEmail {
  const firstName = randomChoice(FIRST_NAMES);
  const lastName = randomChoice(LAST_NAMES);
  const domain = randomChoice(DOMAINS);
  const emailPrefix = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${id % 100}`;
  
  // 85% healthy, 10% warning, 5% burned
  const statusRoll = random();
  let status: EmailStatus = 'healthy';
  if (statusRoll > 0.95) status = 'burned';
  else if (statusRoll > 0.85) status = 'warning';
  
  // Warmup: 60% ready, 35% warming, 5% paused
  const warmupRoll = random();
  let warmupStatus: WarmupStatus = 'ready';
  let warmupDay = 30;
  if (warmupRoll > 0.95) {
    warmupStatus = 'paused';
    warmupDay = randomInt(5, 25);
  } else if (warmupRoll > 0.60) {
    warmupStatus = 'warming';
    warmupDay = randomInt(1, 29);
  }
  
  const warmupReadyDate = new Date();
  warmupReadyDate.setDate(warmupReadyDate.getDate() + (30 - warmupDay));
  
  // Reply rates based on status
  let replyRate: number;
  if (status === 'burned') replyRate = random() * 0.5; // 0-0.5%
  else if (status === 'warning') replyRate = 0.5 + random() * 1; // 0.5-1.5%
  else replyRate = 1.5 + random() * 2.5; // 1.5-4%
  
  const avgReplyRate = 2.2; // baseline
  const dailyLimit = warmupStatus === 'ready' ? randomInt(40, 60) : randomInt(5, 35);
  const currentVolume = randomInt(0, dailyLimit);
  const sentLast7Days = randomInt(100, 400);
  const repliesLast7Days = Math.round(sentLast7Days * (replyRate / 100));
  
  const lastSynced = new Date();
  lastSynced.setMinutes(lastSynced.getMinutes() - randomInt(5, 55));
  
  return {
    id,
    email: `${emailPrefix}@${domain}`,
    name: `${firstName} ${lastName}`,
    domain,
    status,
    warmupStatus,
    warmupDay,
    warmupReadyDate: warmupReadyDate.toISOString().split('T')[0],
    dailyLimit,
    currentVolume,
    replyRate: Math.round(replyRate * 100) / 100,
    avgReplyRate,
    sentLast7Days,
    repliesLast7Days,
    lastSyncedAt: lastSynced.toISOString(),
  };
}

// Generate all 5000 emails
let _emailCache: SenderEmail[] | null = null;

export function generateMockEmails(): SenderEmail[] {
  if (_emailCache) return _emailCache;
  
  _emailCache = [];
  for (let i = 1; i <= 5000; i++) {
    _emailCache.push(generateEmail(i));
  }
  return _emailCache;
}

export function getMockDomainHealth(): DomainHealth[] {
  const emails = generateMockEmails();
  const domainMap = new Map<string, SenderEmail[]>();
  
  emails.forEach(email => {
    const existing = domainMap.get(email.domain) || [];
    existing.push(email);
    domainMap.set(email.domain, existing);
  });
  
  return Array.from(domainMap.entries()).map(([domain, domainEmails]) => {
    const healthyCount = domainEmails.filter(e => e.status === 'healthy').length;
    const warningCount = domainEmails.filter(e => e.status === 'warning').length;
    const burnedCount = domainEmails.filter(e => e.status === 'burned').length;
    
    // Worse spam score if more burned emails
    const burnedRatio = burnedCount / domainEmails.length;
    const spamScore = Math.round((1 + burnedRatio * 8) * 10) / 10;
    
    const blacklistStatus = burnedRatio > 0.15 ? 'listed' : 'clean';
    const blacklistCount = blacklistStatus === 'listed' ? randomInt(1, 3) : 0;
    
    const lastChecked = new Date();
    lastChecked.setMinutes(lastChecked.getMinutes() - randomInt(10, 50));
    
    return {
      domain,
      totalEmails: domainEmails.length,
      healthyEmails: healthyCount,
      warningEmails: warningCount,
      burnedEmails: burnedCount,
      spamScore,
      blacklistStatus,
      blacklistCount,
      spfValid: random() > 0.05,
      dkimValid: random() > 0.05,
      dmarcValid: random() > 0.1,
      inboxPlacementRate: Math.round((85 + random() * 15 - burnedRatio * 30) * 10) / 10,
      lastCheckedAt: lastChecked.toISOString(),
    };
  });
}

export function getMockDashboardStats(): DashboardStats {
  const emails = generateMockEmails();
  const domains = getMockDomainHealth();
  
  const healthyEmails = emails.filter(e => e.status === 'healthy').length;
  const warningEmails = emails.filter(e => e.status === 'warning').length;
  const burnedEmails = emails.filter(e => e.status === 'burned').length;
  const warmingEmails = emails.filter(e => e.warmupStatus === 'warming').length;
  const readyEmails = emails.filter(e => e.warmupStatus === 'ready').length;
  const flaggedDomains = domains.filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5).length;
  
  const totalReplies = emails.reduce((sum, e) => sum + e.repliesLast7Days, 0);
  const totalSent = emails.reduce((sum, e) => sum + e.sentLast7Days, 0);
  const avgReplyRate = Math.round((totalReplies / totalSent) * 100 * 100) / 100;
  
  return {
    totalEmails: emails.length,
    healthyEmails,
    warningEmails,
    burnedEmails,
    totalDomains: domains.length,
    flaggedDomains,
    avgReplyRate,
    warmingEmails,
    readyEmails,
  };
}

// Paginated email fetch (simulates API)
export function getEmails(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: EmailStatus | 'all';
  warmupStatus?: WarmupStatus | 'all';
  domain?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): { data: SenderEmail[]; total: number; page: number; pageSize: number; totalPages: number } {
  const {
    page = 1,
    pageSize = 50,
    search = '',
    status = 'all',
    warmupStatus = 'all',
    domain = '',
    sortBy = 'id',
    sortOrder = 'asc'
  } = params;
  
  let emails = generateMockEmails();
  
  // Filter
  if (search) {
    const searchLower = search.toLowerCase();
    emails = emails.filter(e => 
      e.email.toLowerCase().includes(searchLower) ||
      e.name.toLowerCase().includes(searchLower)
    );
  }
  
  if (status !== 'all') {
    emails = emails.filter(e => e.status === status);
  }
  
  if (warmupStatus !== 'all') {
    emails = emails.filter(e => e.warmupStatus === warmupStatus);
  }
  
  if (domain) {
    emails = emails.filter(e => e.domain === domain);
  }
  
  // Sort
  emails = [...emails].sort((a, b) => {
    const aVal = a[sortBy as keyof SenderEmail];
    const bVal = b[sortBy as keyof SenderEmail];
    const compare = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === 'asc' ? compare : -compare;
  });
  
  const total = emails.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = emails.slice(start, start + pageSize);
  
  return { data, total, page, pageSize, totalPages };
}
