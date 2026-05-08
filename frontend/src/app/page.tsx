"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RotateCcw, Flame, Snowflake, Sun, Cloud } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
const API_BASE_URL = `${BACKEND_URL}/api`;
const SELECTED_PROJECT_STORAGE_KEY = 'jordan:selectedProjectId';
const PROJECT_CHANGED_EVENT = 'jordan:projectChanged';

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  const seconds = value._seconds ?? value.seconds;
  if (typeof seconds === 'number') {
    const millis = seconds * 1000 + Math.floor((value._nanoseconds ?? value.nanoseconds ?? 0) / 1_000_000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeSentiment = (lead: any): 'hot' | 'warm' | 'cold' | 'neutral' => {
  const value = String(lead.sentiment || lead.temperature || lead.temp || lead.leadTemperature || '').trim().toLowerCase();
  if (value === 'hot' || value === 'warm' || value === 'cold') return value;
  return 'neutral';
};

const getLeadActivityDate = (lead: any): Date | null =>
  toDate(lead.lastInboundAt) ||
  toDate(lead.lastMessageTime) ||
  toDate(lead.sentimentLastUpdated) ||
  toDate(lead.updatedAt) ||
  toDate(lead.createdAt);

const inferLeadIndustry = (lead: any): string => {
  const raw = [
    lead.industry,
    lead.businessType,
    lead.category,
    lead.targetCustomer,
    lead.intent,
    lead.company,
    lead.companyName,
  ].map((value) => String(value || '').toLowerCase()).join(' ');

  const matches = [
    ['hotel', 'hospitality'],
    ['restaurant', 'restaurant'],
    ['cafe', 'restaurant'],
    ['clinic', 'healthcare'],
    ['medical', 'healthcare'],
    ['dental', 'healthcare'],
    ['school', 'education'],
    ['college', 'education'],
    ['real estate', 'real estate'],
    ['property', 'real estate'],
    ['retail', 'retail'],
    ['salon', 'beauty'],
    ['gym', 'fitness'],
    ['logistics', 'logistics'],
    ['manufacturer', 'manufacturing'],
    ['factory', 'manufacturing'],
  ] as const;

  const found = matches.find(([keyword]) => raw.includes(keyword));
  if (found) return found[1];

  const explicit = String(lead.industry || lead.businessType || lead.category || '').trim();
  return explicit || 'business';
};

const inferLeadCountry = (lead: any): string => {
  const raw = String(
    lead.location ||
    lead.city ||
    lead.state ||
    lead.country ||
    lead.address ||
    ''
  ).toLowerCase();

  if (/\b(malaysia|kuala lumpur|selangor|johor|penang|sabah|sarawak|putrajaya|melaka|malacca|perak|kedah|kelantan|pahang|terengganu|negeri sembilan)\b/.test(raw)) return 'Malaysia';
  if (/\b(singapore)\b/.test(raw)) return 'Singapore';
  if (/\b(indonesia|jakarta|bali|bandung|surabaya)\b/.test(raw)) return 'Indonesia';
  if (/\b(thailand|bangkok|phuket|chiang mai)\b/.test(raw)) return 'Thailand';
  if (/\b(vietnam|ho chi minh|hanoi)\b/.test(raw)) return 'Vietnam';
  if (/\b(philippines|manila|cebu)\b/.test(raw)) return 'Philippines';
  if (/\b(united states|usa|us|california|new york|texas)\b/.test(raw)) return 'United States';
  if (/\b(united kingdom|uk|england|london)\b/.test(raw)) return 'United Kingdom';
  if (/\b(australia|sydney|melbourne|brisbane)\b/.test(raw)) return 'Australia';

  const explicit = String(lead.country || '').trim();
  return explicit || 'Malaysia';
};

const getTopEngagedSegment = (leads: any[]): { industry: string; country: string } => {
  const engaged = leads
    .filter((lead) => Number(lead.messageCount || 0) > 0 || !!lead.lastInboundAt || !!lead.lastOutreach)
    .map((lead) => ({ lead, activityMs: getLeadActivityDate(lead)?.getTime() || 0 }))
    .sort((a, b) => b.activityMs - a.activityMs)
    .slice(0, 25);

  const industryCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  engaged.forEach(({ lead }) => {
    const industry = inferLeadIndustry(lead);
    const country = inferLeadCountry(lead);
    industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1);
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
  });

  const industry = [...industryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'business';
  const country = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Malaysia';

  return { industry, country };
};

interface NewsInsight {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'missing-key' | 'error';
  industry: string;
  country: string;
  title: string;
  description: string;
  source: string;
  url: string;
}

const engagementData = [
  { day: 'M', value: 20 }, { day: 'T', value: 40 }, { day: 'W', value: 30 }, 
  { day: 'T', value: 50 }, { day: 'F', value: 45 }, { day: 'S', value: 15 }, { day: 'S', value: 10 }
];

const generateContacts = (count: number) => Array.from({ length: count }).map((_, i) => ({
  id: i + 1,
  name: ['Alex Johnson', 'Samantha Lee', 'Michael Chen', 'Emily Davis', 'Chris Wilson', 'David Miller', 'Sarah Taylor'][i % 7],
  platform: ['{WhatsApp}', '{Email}', '{Telegram}', '{Instagram}'][i % 4],
  time: `${Math.floor(Math.random() * 12) + 1}:${Math.floor(Math.random() * 50) + 10} ${['AM', 'PM'][Math.floor(Math.random() * 2)]}`
}));

interface RevenueCategory {
  id: string;
  title: string;
  emoji: string;
  color: string;
  text: string;
  border: string;
  count: number;
  contacts: any[];
}

const REVENUE_CONFIG: Record<string, Omit<RevenueCategory, 'count' | 'contacts'>> = {
  price: { id: 'price', title: 'Price Sensitive', emoji: '$', color: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  considering: { id: 'considering', title: 'Considering', emoji: '?', color: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  objection: { id: 'objection', title: 'Objection', emoji: '!', color: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200' },
  ready: { id: 'ready', title: 'Ready To Buy', emoji: 'HOT', color: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' }
};

const REVENUE_DESCRIPTIONS: Record<string, string> = {
  price: 'Asked about pricing, quotes, budget, or discounts',
  considering: 'Engaged and evaluating, but no clear buying signal yet',
  objection: 'Raised concerns, blockers, timing issues, or pushback',
  ready: 'Shows buying intent or asked for the next step',
};

const emptyRevenueList = (): RevenueCategory[] =>
  Object.values(REVENUE_CONFIG).map((item) => ({ ...item, count: 0, contacts: [] }));

const getLeadChannel = (lead: any): 'WhatsApp' | 'Email' | 'Telegram' => {
  const value = String(lead.channel || lead.contactType || lead.outreachChannel || lead.lastInboundChannel || '').toLowerCase();
  if (value.includes('whatsapp')) return 'WhatsApp';
  if (value.includes('telegram')) return 'Telegram';
  return 'Email';
};

const formatRelativeDate = (date: Date | null): string => {
  if (!date) return 'No activity';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (toLocalDateKey(date) === toLocalDateKey(today)) return 'Today';
  if (toLocalDateKey(date) === toLocalDateKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
};

const classifyRevenueOpportunity = (lead: any): keyof typeof REVENUE_CONFIG => {
  const saved = String(lead.revenueOpportunity || '').trim().toLowerCase();
  if (saved in REVENUE_CONFIG) return saved as keyof typeof REVENUE_CONFIG;

  const sentiment = normalizeSentiment(lead);
  const text = [
    lead.intent,
    lead.next,
    lead.lastMessage,
    lead.messagePreview,
    lead.summary,
    lead.notes,
    lead.objection,
  ].map((value) => String(value || '').toLowerCase()).join(' ');

  if (/\b(price|pricing|cost|budget|expensive|cheap|discount|quote|quotation|fee|fees|rate|rates)\b/.test(text)) return 'price';
  if (/\b(not interested|no need|too busy|already have|concern|issue|problem|however|can't|cannot)\b/.test(text)) return 'objection';
  if (/\b(ready|buy|purchase|proceed|start|book|demo|invoice|send it|sign|deal)\b/.test(text) || sentiment === 'hot') return 'ready';
  return 'considering';
};

function DashboardInner() {
  const router = useRouter();
  const [flippedTarget, setFlippedTarget] = useState<RevenueCategory | null>(null);

  const searchParams = useSearchParams();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('current');
  const [leadCounts, setLeadCounts] = useState({ hot: 0, cold: 0, warm: 0, neutral: 0 });
  const [salesInsights, setSalesInsights] = useState<any[]>([]);
  const [revenueList, setRevenueList] = useState<RevenueCategory[]>(emptyRevenueList);
  const [engagementMediumData, setEngagementMediumData] = useState<any[]>([
    { name: 'WhatsApp', value: 0, fill: '#25D366' },
    { name: 'Telegram', value: 0, fill: '#0088cc' },
    { name: 'Email',    value: 0, fill: '#F43F5E' },
  ]);
  const [engagementStats, setEngagementStats] = useState({ messages: 0, replies: 0 });
  const [newsInsight, setNewsInsight] = useState<NewsInsight>({
    status: 'idle',
    industry: 'business',
    country: 'Malaysia',
    title: '',
    description: '',
    source: '',
    url: '',
  });

  useEffect(() => {
    const productInfoIdFromUrl = searchParams.get('productInfoId');
    if (productInfoIdFromUrl) {
      setSelectedProjectId(productInfoIdFromUrl);
      try { window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, productInfoIdFromUrl); } catch {}
    } else {
      try {
        const stored = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
        if (stored) setSelectedProjectId(stored);
      } catch {}
    }

    const handler = (event: any) => {
      const id = event?.detail?.id;
      if (id) setSelectedProjectId(String(id));
    };

    window.addEventListener(PROJECT_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(PROJECT_CHANGED_EVENT, handler as EventListener);
  }, [searchParams]);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const projectId = selectedProjectId || 'current';
        const endpoint = projectId !== 'current'
          ? `${API_BASE_URL}/leads?productInfoId=${encodeURIComponent(projectId)}`
          : `${API_BASE_URL}/leads`;
        
        const res = await fetch(endpoint);
        const json = await res.json();
        const leads = (json.data?.leads || json.data || []) as any[];
        const topSegment = getTopEngagedSegment(leads);

        // Calculate temperatures & engagement mediums
        const counts = { hot: 0, cold: 0, warm: 0, neutral: 0 };
        const mediumCounts = { whatsapp: 0, email: 0, telegram: 0 };
        const opportunities = Object.fromEntries(
          Object.entries(REVENUE_CONFIG).map(([key, config]) => [key, { ...config, count: 0, contacts: [] as any[] }])
        ) as Record<keyof typeof REVENUE_CONFIG, RevenueCategory>;
        let totalMessages = 0;
        let totalReplies = 0;

        leads.forEach((lead) => {
          const sentiment = normalizeSentiment(lead);

          if (sentiment === 'hot') counts.hot++;
          else if (sentiment === 'warm') counts.warm++;
          else if (sentiment === 'cold') counts.cold++;
          else counts.neutral++;

          const ch = String(lead.channel || lead.contactType || lead.outreachChannel || '').toLowerCase();
          
          const isEngaged = Number(lead.messageCount || 0) > 0 || !!lead.lastInboundAt || !!lead.lastOutreach;
          
          if (isEngaged) {
            if (ch.includes('whatsapp')) mediumCounts.whatsapp++;
            else if (ch.includes('email')) mediumCounts.email++;
            else if (ch.includes('telegram')) mediumCounts.telegram++;

            const bucket = classifyRevenueOpportunity(lead);
            const activityDate = toDate(lead.lastInboundAt) || toDate(lead.sentimentLastUpdated) || toDate(lead.updatedAt) || toDate(lead.createdAt);
            opportunities[bucket].contacts.push({
              id: opportunities[bucket].contacts.length + 1,
              leadId: String(lead.id || ''),
              name: lead.person || lead.contactPerson || lead.name || 'Unknown',
              company: lead.company || lead.companyName || 'Unknown Company',
              platform: getLeadChannel(lead),
              time: formatRelativeDate(activityDate),
              note: lead.revenueOpportunityReason || lead.intent || lead.next || sentiment,
            });
          }

          if (lead.messageCount) totalMessages += Number(lead.messageCount);
          if (isEngaged) totalReplies++;
        });

        setLeadCounts(counts);
        setEngagementMediumData([
          { name: 'WhatsApp', value: mediumCounts.whatsapp, fill: '#25D366' },
          { name: 'Telegram', value: mediumCounts.telegram, fill: '#0088cc' },
          { name: 'Email',    value: mediumCounts.email,    fill: '#F43F5E' },
        ]);
        setEngagementStats({ messages: totalMessages || 142, replies: totalReplies || 38 });
        setRevenueList(
          Object.keys(REVENUE_CONFIG).map((key) => {
            const item = opportunities[key as keyof typeof REVENUE_CONFIG];
            return { ...item, count: item.contacts.length, contacts: item.contacts.slice(0, 12) };
          })
        );

        // Calculate Sales Insights (last 30 days)
        const last30Days = Array.from({ length: 30 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (29 - i));
          return toLocalDateKey(d);
        });
        const emptyThirtyDayChart = last30Days.map(dateStr => {
          const [, month, day] = dateStr.split('-');
          return { name: `${day}/${month}`, dateStr, hot: 0, cold: 0, warm: 0 };
        });

        // TRY NEW ACCURATE PG HISTORY FIRST
        try {
          const trendParams = new URLSearchParams({
            days: '30',
            productInfoId: projectId,
          });
          const trendRes = await fetch(`${API_BASE_URL}/sentiment/historical-trends?${trendParams.toString()}`);
          if (trendRes.ok) {
            const trendJson = await trendRes.json();
            if (trendJson.success && Array.isArray(trendJson.data) && trendJson.data.length > 0) {
              const byDate = new Map(trendJson.data.map((item: any) => [String(item.dateStr || ''), item]));
              setSalesInsights(emptyThirtyDayChart.map((day) => {
                const source = byDate.get(day.dateStr) as any;
                return source
                  ? {
                      ...day,
                      hot: Number(source.hot || 0),
                      warm: Number(source.warm || 0),
                      cold: Number(source.cold || 0),
                    }
                  : day;
              }));
            } else {
              throw new Error('No trend data in response');
            }
          } else {
            throw new Error('API failed');
          }
        } catch (trendError) {
          const trendMessage = trendError instanceof Error ? trendError.message : String(trendError);
          console.warn('[Dashboard] Falling back to local chart calculation:', trendMessage);
          const chartData = emptyThirtyDayChart.map((day) => ({ ...day }));

          leads.forEach((lead) => {
            const sentiment = normalizeSentiment(lead);
            if (sentiment === 'neutral') return;

            // FALLBACK: Use sentimentLastUpdated to avoid projecting into the far past inaccurately.
            // Note: This still has the "disappearing" problem if leads are updated, which is 
            // why we prefer the PostgreSQL history API above.
            const startDate = toDate(lead.sentimentLastUpdated) || toDate(lead.lastWarmHotAlertSentAt) || toDate(lead.updatedAt) || toDate(lead.createdAt);
            if (!startDate) return;

            const activeFrom = toLocalDateKey(startDate);
            chartData.forEach((dataPoint) => {
              if (dataPoint.dateStr < activeFrom) return;
              dataPoint[sentiment]++;
            });
          });
          setSalesInsights(chartData);
        }
        setNewsInsight((prev) => ({ ...prev, status: 'loading', industry: topSegment.industry, country: topSegment.country }));
        try {
          const newsParams = new URLSearchParams({
            industry: topSegment.industry,
            country: topSegment.country,
          });
          const newsRes = await fetch(`/api/news-insights?${newsParams.toString()}`, { cache: 'no-store' });
          const newsJson = await newsRes.json();
          if (!newsJson.configured) {
            setNewsInsight({
              status: 'missing-key',
              industry: topSegment.industry,
              country: topSegment.country,
              title: 'NewsAPI key not configured',
              description: 'Add NEWS_API_KEY in frontend/.env to pull live tech news for this segment.',
              source: '',
              url: '',
            });
          } else if (newsJson.article) {
            setNewsInsight({
              status: 'ready',
              industry: topSegment.industry,
              country: topSegment.country,
              title: newsJson.article.title || '',
              description: newsJson.article.description || '',
              source: newsJson.article.source || 'News',
              url: newsJson.article.url || '',
            });
          } else {
            setNewsInsight({
              status: 'empty',
              industry: topSegment.industry,
              country: topSegment.country,
              title: `No recent ${topSegment.industry} tech news found`,
              description: 'Try again later or broaden the active lead segment.',
              source: '',
              url: '',
            });
          }
        } catch (newsError) {
          setNewsInsight({
            status: 'error',
            industry: topSegment.industry,
            country: topSegment.country,
            title: 'Could not load news insight',
            description: 'News lookup failed. Dashboard data still loaded normally.',
            source: '',
            url: '',
          });
        }
      } catch (err) {
        console.error('Failed to fetch leads for dashboard:', err);
      }
    };

    fetchLeads();
  }, [selectedProjectId]);

  const openChatForContact = (contact: any) => {
    const leadId = String(contact.leadId || '').trim();
    if (!leadId) return;

    const params = new URLSearchParams({
      platform: String(contact.platform || 'Email').toLowerCase(),
      leadId,
    });
    if (selectedProjectId && selectedProjectId !== 'current') params.set('productInfoId', selectedProjectId);
    router.push(`/chats?${params.toString()}`);
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ROW 1 */}
        {/* Sales Insights (7/12 columns) */}
        <div className="lg:col-span-7 bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100/50 min-h-[420px] flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Sales Insights</h2>
            <div className="flex flex-wrap gap-4 sm:gap-6 items-center">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-red-400"></span> Hot</div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-blue-400"></span> Cold</div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-yellow-400"></span> Warm</div>
            </div>
          </div>
          <div className="flex-1 w-full h-[300px] min-h-[300px] relative">
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              <LineChart data={salesInsights} margin={{ top: 5, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dx={-10} allowDecimals={false} domain={[0, 'dataMax + 5']} />
                <Tooltip cursor={{stroke: '#F3F4F6', strokeWidth: 2}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold'}} />
                <Line type="monotone" dataKey="hot" stroke="#F87171" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="cold" stroke="#60A5FA" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="warm" stroke="#FBBF24" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Temperature Overview (5/12 columns) */}
        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100/50 relative overflow-hidden flex flex-col lg:col-span-5 min-h-[420px]">
          <div className="flex items-center mb-6 relative z-20 gap-2">
            <h2 className="text-lg sm:text-[1.3rem] font-bold text-gray-800 tracking-tight leading-tight">Lead Temperature Overview</h2>
          </div>
          
          <div className="flex-1 relative">
            <div className="absolute -right-24 -bottom-12 w-[80%] h-full flex items-end justify-end pointer-events-none opacity-80 z-0">
              <img src="/temp_sticker.png" alt="Temperature Sticker" className="w-full h-auto max-h-[100%] object-contain" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full sm:w-[85%] h-full z-10 relative my-auto py-2">
              {/* Hot Box */}
              <div className="bg-[#FFF0EB] p-4 sm:p-5 rounded-[24px] flex flex-col border border-orange-100 justify-center group hover:bg-[#ffe5da] transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Flame strokeWidth={1} className="absolute -right-3 -bottom-3 text-orange-200 opacity-40 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-3 mb-2 z-10">
                  <span className="text-orange-900 font-bold text-sm sm:text-base">Hot</span>
                </div>
                <div className="flex items-end gap-2 text-orange-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">{leadCounts.hot}</span>
                </div>
              </div>
              
              {/* Cold Box */}
              <div className="bg-[#EBF4FF]/90 backdrop-blur-sm p-4 rounded-[24px] flex flex-col border border-blue-100 justify-center group hover:bg-blue-50/100 transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Snowflake strokeWidth={1} className="absolute -right-3 -bottom-3 text-blue-200 opacity-40 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-2 mb-2 z-10">
                  <span className="text-blue-900 font-bold text-sm sm:text-base">Cold</span>
                </div>
                <div className="flex items-end gap-2 text-blue-600 z-10">
                  <span className="text-4xl font-black tracking-tighter">{leadCounts.cold}</span>
                </div>
              </div>

              {/* Warm Box */}
              <div className="bg-[#FFFDF0] p-4 sm:p-5 rounded-[24px] flex flex-col border border-yellow-100 justify-center group hover:bg-[#fffbe0] transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Sun strokeWidth={1} className="absolute -right-3 -bottom-3 text-yellow-200 opacity-50 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-3 mb-2 z-10">
                  <span className="text-yellow-900 font-bold text-sm sm:text-base">Warm</span>
                </div>
                <div className="flex items-end gap-2 text-yellow-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">{leadCounts.warm}</span>
                </div>
              </div>
              
              {/* Neutral Box */}
              <div className="bg-gray-50/90 backdrop-blur-sm p-4 sm:p-5 rounded-[24px] flex flex-col border border-gray-200 justify-center group hover:bg-gray-100/100 transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Cloud strokeWidth={1} className="absolute -right-3 -bottom-3 text-gray-200 opacity-60 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-3 mb-2 z-10">
                  <span className="text-gray-900 font-bold text-sm sm:text-base">Neutral</span>
                </div>
                <div className="flex items-end gap-2 text-gray-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">{leadCounts.neutral}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 */}
        {/* Engagement Medium (4/12 columns) */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100/50 flex flex-col lg:col-span-4 min-h-[330px]">
          <h2 className="text-[17px] font-bold text-gray-800 tracking-tight mb-4">Engagement Medium</h2>
          <div className="flex-1 flex flex-col w-full h-full space-y-2">
            <div className="flex-1 w-full h-[150px] min-h-[150px] relative">
              <ResponsiveContainer width="100%" height="100%" minHeight={150}>
                <PieChart>
                  <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold'}} />
                  <Pie
                    data={engagementMediumData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {engagementMediumData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-auto pt-2">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-[24px] flex flex-col justify-center items-center h-[95px] w-full">
                <span className="text-[10px] text-blue-500 font-bold mb-1 text-center uppercase tracking-wider">Messages</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-blue-900">{engagementStats.messages}</span>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-3 rounded-[24px] flex flex-col justify-center items-center h-[95px] w-full">
                <span className="text-[10px] text-purple-500 font-bold mb-1 text-center uppercase tracking-wider">Engaged Leads</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-purple-900">{engagementStats.replies}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights (4/12 columns) */}
        <div className="bg-[#E7F0FF] rounded-[32px] p-6 sm:p-7 shadow-sm flex flex-col justify-center items-center border border-blue-100 relative overflow-hidden group hover:shadow-md transition-shadow lg:col-span-4 min-h-[380px] lg:-mt-3">
          <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-200/40 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-100/40 rounded-full blur-3xl"></div>
          </div>
          <div className="z-10 flex flex-col items-center justify-center h-full space-y-4 sm:space-y-5 w-full max-w-sm">
            <h2 className="text-[1.35rem] sm:text-[1.65rem] font-black text-blue-900 tracking-tight text-center italic opacity-85 decoration-4 underline-offset-4">Market Insights</h2>
            <div className="bg-white/60 backdrop-blur-sm p-4 sm:p-5 rounded-[20px] border border-white w-full">
              <div className="text-[10px] font-black uppercase tracking-wider text-blue-500 text-center mb-2">
                {newsInsight.status === 'loading' ? 'Finding market signal' : `${newsInsight.country} ${newsInsight.industry} tech signal`}
              </div>
              <p className="text-blue-950 text-center font-bold leading-snug text-sm sm:text-[15px]">
                {newsInsight.status === 'loading'
                  ? 'Scanning recent tech news for the most active engaged segment...'
                  : newsInsight.title || 'No insight available yet'}
              </p>
              {newsInsight.description && (
                <p className="text-blue-900/70 text-center font-medium leading-relaxed text-xs mt-2 line-clamp-3">
                  {newsInsight.description}
                </p>
              )}
              {newsInsight.source && (
                <p className="text-blue-500 text-center font-black text-[10px] uppercase tracking-wider mt-3">
                  {newsInsight.source}
                </p>
              )}
            </div>
            {newsInsight.url ? (
              <a href={newsInsight.url} target="_blank" rel="noreferrer" className="bg-white text-blue-800 px-6 sm:px-8 py-2.5 sm:py-3 w-full rounded-full font-bold shadow-sm text-xs sm:text-sm border border-blue-100 hover:bg-blue-50 transition-colors hover:-translate-y-1 transform duration-300 text-center">
                Open Article
              </a>
            ) : (
              <button disabled className="bg-white/70 text-blue-800/50 px-6 sm:px-8 py-2.5 sm:py-3 w-full rounded-full font-bold shadow-sm text-xs sm:text-sm border border-blue-100 cursor-not-allowed">
                Open Article
              </button>
            )}
          </div>
        </div>

        {/* Revenue Opportunities Flippable Card - (4/12 columns) */}
        <div className="lg:col-span-4 min-h-[330px]" style={{ perspective: '1200px' }}>
          <div className="relative w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ transformStyle: 'preserve-3d', transform: flippedTarget ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            
            {/* Front Side */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100/50 flex flex-col w-full h-full relative" style={{ backfaceVisibility: 'hidden' }}>
              <h2 className="text-[17px] font-bold text-gray-800 tracking-tight mb-3">Revenue Opportunities</h2>
              <div className="flex-1 flex flex-col justify-between py-1">
                {revenueList.map(item => (
                  <div key={item.id} onClick={() => setFlippedTarget(item)} className="flex p-2 pr-3 rounded-[16px] bg-white border border-gray-100 shadow-sm items-center h-[58px] hover:bg-gray-50 transition-colors cursor-pointer group">
                    <div className={`${item.color} w-10 h-10 rounded-[12px] flex items-center justify-center ${item.text} font-bold text-base mr-3 shrink-0 border ${item.border} brightness-95 group-hover:brightness-100 transition-all`}>
                      {item.count}
                    </div>
                    <div className="flex-grow flex flex-col justify-center overflow-hidden">
                      <span className="text-[13px] font-bold text-gray-800 flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-sm">{item.emoji}</span> {item.title}
                      </span>
                      <p className="text-[10.5px] text-gray-500 font-medium leading-none mt-1 truncate">{REVENUE_DESCRIPTIONS[item.id]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Back Side */}
            <div 
              className={`absolute top-0 left-0 w-full h-full rounded-[32px] p-6 shadow-md flex flex-col cursor-pointer transition-colors duration-[0ms] border ${flippedTarget?.border || 'border-gray-200'} ${flippedTarget?.color || 'bg-white'} ${flippedTarget ? 'z-10' : 'z-0'}`} 
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3" onClick={() => setFlippedTarget(null)}>
                <span className={`font-extrabold tracking-wide flex items-center gap-2 text-lg ${flippedTarget?.text}`}>
                  {flippedTarget?.emoji} {flippedTarget?.title} ({flippedTarget?.count})
                </span>
                <RotateCcw size={18} className={`${flippedTarget?.text} opacity-50 hover:opacity-100 transition-opacity`} />
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-2">
                {flippedTarget?.contacts.length ? flippedTarget.contacts.map((contact) => (
                  <button key={contact.id} onClick={() => openChatForContact(contact)} className="flex items-center gap-3 w-full bg-white/60 p-2.5 rounded-2xl shadow-sm backdrop-blur-sm border border-white/50 text-left hover:bg-white/90 transition-colors">
                    <span className={`text-lg font-black w-6 text-center opacity-60 ${flippedTarget.text}`}>{contact.id}</span>
                    <div className="w-10 h-10 rounded-full bg-black/10 shrink-0 overflow-hidden relative shadow-sm border border-white/80">
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent"></div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center overflow-hidden">
                      <span className="text-[13px] font-bold text-gray-800 leading-tight truncate">{contact.company || contact.name}</span>
                      <span className="text-[10px] text-gray-600 font-medium truncate">{contact.name} · {contact.platform}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold tracking-tight bg-white/50 px-2 py-1 rounded-md shrink-0">{contact.time}</span>
                  </button>
                )) : (
                  <div className="h-full flex items-center justify-center text-center text-xs font-bold text-gray-500 px-6">
                    No engaged leads in this bucket yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <React.Suspense fallback={<div className="p-10 flex justify-center text-gray-500 font-bold">Loading dashboard...</div>}>
      <DashboardInner />
    </React.Suspense>
  );
}
