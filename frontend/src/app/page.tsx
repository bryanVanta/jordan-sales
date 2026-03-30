"use client";
import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ChevronDown, RotateCcw, Flame, Snowflake, Sun, Cloud, TrendingUp } from 'lucide-react';

const salesData = [
  { name: 'Jan', hot: 40, cold: 24, warm: 24 },
  { name: 'Feb', hot: 30, cold: 13, warm: 22 },
  { name: 'Mar', hot: 20, cold: 48, warm: 32 },
  { name: 'Apr', hot: 27, cold: 39, warm: 20 },
  { name: 'May', hot: 18, cold: 48, warm: 21 },
  { name: 'Jun', hot: 23, cold: 38, warm: 25 },
  { name: 'Jul', hot: 34, cold: 43, warm: 21 },
];

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

const REVENUE_DATA: Record<string, RevenueCategory> = {
  price: { id: 'price', title: 'Price Sensitive', emoji: '💰', color: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', count: 18, contacts: generateContacts(18) },
  considering: { id: 'considering', title: 'Considering', emoji: '🤔', color: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200', count: 24, contacts: generateContacts(24) },
  objection: { id: 'objection', title: 'Objection', emoji: '⚠️', color: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200', count: 8, contacts: generateContacts(8) },
  ready: { id: 'ready', title: 'Ready To Buy', emoji: '🔥', color: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', count: 12, contacts: generateContacts(12) }
};

export default function Dashboard() {
  const [dateFilter, setDateFilter] = useState('Today');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [flippedTarget, setFlippedTarget] = useState<RevenueCategory | null>(null);

  const revenueList = useMemo(() => Object.values(REVENUE_DATA), []);

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 pb-10">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* ROW 1 */}
        {/* Sales Insights (7/12 columns) */}
        <div className="xl:col-span-7 bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100/50 min-h-[420px] flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Sales Insights</h2>
            <div className="flex flex-wrap gap-4 sm:gap-6 items-center">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-red-400"></span> Hot</div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-blue-400"></span> Cold</div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-600"><span className="w-4 h-1 rounded-full bg-yellow-400"></span> Warm</div>
            </div>
          </div>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData} margin={{ top: 5, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dx={-10} />
                <Tooltip cursor={{stroke: '#F3F4F6', strokeWidth: 2}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold'}} />
                <Line type="monotone" dataKey="hot" stroke="#F87171" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="cold" stroke="#60A5FA" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="warm" stroke="#FBBF24" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Temperature Overview (5/12 columns) */}
        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100/50 relative overflow-hidden flex flex-col xl:col-span-5 min-h-[420px]">
          <div className="flex justify-between items-center mb-6 relative z-20 gap-2">
            <h2 className="text-lg sm:text-[1.3rem] font-bold text-gray-800 tracking-tight leading-tight w-full sm:w-[60%]">Lead Temperature Overview</h2>
            <div className="relative">
              <button 
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="flex items-center gap-1 text-[13px] bg-gray-50 text-gray-700 px-4 py-2 rounded-full border border-gray-200 font-medium hover:bg-gray-100 transition-colors shadow-sm">
                {dateFilter} <ChevronDown size={14} className="text-gray-500" />
              </button>
              {showDateDropdown && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-30 w-36">
                  {['Today', 'Yesterday', '3 days ago', '7 days ago'].map(opt => (
                     <div key={opt} onClick={() => { setDateFilter(opt); setShowDateDropdown(false); }} className="px-4 py-3 border-b border-gray-50 last:border-0 text-sm hover:bg-gray-50 cursor-pointer font-medium text-gray-700 transition-colors">
                       {opt}
                     </div>
                  ))}
                </div>
              )}
            </div>
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
                  <div className="bg-white/60 text-orange-700 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center gap-0.5 shadow-sm border border-orange-100/50">
                     <TrendingUp size={12} strokeWidth={3} /> +12
                  </div>
                </div>
                <div className="flex items-end gap-2 text-orange-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">42</span>
                </div>
              </div>
              
              {/* Cold Box */}
              <div className="bg-[#EBF4FF]/90 backdrop-blur-sm p-4 rounded-[24px] flex flex-col border border-blue-100 justify-center group hover:bg-blue-50/100 transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Snowflake strokeWidth={1} className="absolute -right-3 -bottom-3 text-blue-200 opacity-40 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-2 mb-2 z-10">
                  <span className="text-blue-900 font-bold text-sm sm:text-base">Cold</span>
                  <div className="bg-white/60 text-blue-700 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center gap-0.5 shadow-sm border border-blue-100/50">
                     <TrendingUp size={12} strokeWidth={3} /> +3
                  </div>
                </div>
                <div className="flex items-end gap-2 text-blue-600 z-10">
                  <span className="text-4xl font-black tracking-tighter">18</span>
                </div>
              </div>

              {/* Warm Box */}
              <div className="bg-[#FFFDF0] p-4 sm:p-5 rounded-[24px] flex flex-col border border-yellow-100 justify-center group hover:bg-[#fffbe0] transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Sun strokeWidth={1} className="absolute -right-3 -bottom-3 text-yellow-200 opacity-50 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-3 mb-2 z-10">
                  <span className="text-yellow-900 font-bold text-sm sm:text-base">Warm</span>
                  <div className="bg-white/60 text-yellow-700 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center gap-0.5 shadow-sm border border-yellow-100/50">
                     <TrendingUp size={12} strokeWidth={3} /> +8
                  </div>
                </div>
                <div className="flex items-end gap-2 text-yellow-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">27</span>
                </div>
              </div>
              
              {/* Neutral Box */}
              <div className="bg-gray-50/90 backdrop-blur-sm p-4 sm:p-5 rounded-[24px] flex flex-col border border-gray-200 justify-center group hover:bg-gray-100/100 transition-colors relative overflow-hidden h-28 sm:h-32 z-10">
                <Cloud strokeWidth={1} className="absolute -right-3 -bottom-3 text-gray-200 opacity-60 w-12 h-12 sm:w-16 sm:h-16" />
                <div className="flex items-center gap-3 mb-2 z-10">
                  <span className="text-gray-900 font-bold text-sm sm:text-base">Neutral</span>
                  <div className="bg-white/60 text-gray-700 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center gap-0.5 shadow-sm border border-gray-200/50">
                     <TrendingUp size={11} strokeWidth={3} /> +1
                  </div>
                </div>
                <div className="flex items-end gap-2 text-gray-600 z-10">
                  <span className="text-4xl sm:text-5xl font-black tracking-tighter">9</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 */}
        {/* Engagement Frequency (4/12 columns) */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100/50 flex flex-col xl:col-span-4 min-h-[350px]">
          <h2 className="text-[17px] font-bold text-gray-800 tracking-tight mb-4">Engagement Frequency</h2>
          <div className="flex-1 flex flex-col w-full h-full space-y-2">
            <div className="flex-1 w-full min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} margin={{ top: 0, right: 0, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dy={5} />
                  <Bar dataKey="value" fill="#60A5FA" radius={[6, 6, 0, 0]} activeBar={{ fill: '#3B82F6' }}  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-auto pt-2">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-[24px] flex flex-col justify-center items-center h-[95px] w-full">
                <span className="text-[10px] text-blue-500 font-bold mb-1 text-center uppercase tracking-wider">Messages</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-blue-900">142</span>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-3 rounded-[24px] flex flex-col justify-center items-center h-[95px] w-full">
                <span className="text-[10px] text-purple-500 font-bold mb-1 text-center uppercase tracking-wider">Replies</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-purple-900">38</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights (4/12 columns) */}
        <div className="bg-[#E7F0FF] rounded-[32px] p-6 sm:p-8 shadow-sm flex flex-col justify-center items-center border border-blue-100 relative overflow-hidden group hover:shadow-md transition-shadow xl:col-span-4 min-h-[350px]">
          <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-200/40 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-100/40 rounded-full blur-3xl"></div>
          </div>
          <div className="z-10 flex flex-col items-center justify-center h-full space-y-4 sm:space-y-5 w-full max-w-sm">
            <h2 className="text-[1.4rem] sm:text-[1.8rem] font-black text-blue-900 tracking-tight text-center italic opacity-85 decoration-4 underline-offset-4">AI Insights</h2>
            <div className="bg-white/60 backdrop-blur-sm p-4 sm:p-5 rounded-[20px] border border-white w-full">
              <p className="text-blue-950 text-center font-medium leading-relaxed text-sm sm:text-[15px]">
                Lead engagement is up by <span className="font-bold text-blue-700">25%</span>. Focus on resolving <span className="font-bold text-yellow-600">Warm</span> leads to double your immediate conversions.
              </p>
            </div>
            <button className="bg-white text-blue-800 px-6 sm:px-8 py-2.5 sm:py-3 w-full rounded-full font-bold shadow-sm text-xs sm:text-sm border border-blue-100 hover:bg-blue-50 transition-colors hover:-translate-y-1 transform duration-300">
               Explore Strategy
            </button>
          </div>
        </div>

        {/* Revenue Opportunities Flippable Card - (4/12 columns) */}
        <div className="xl:col-span-4 min-h-[350px]" style={{ perspective: '1200px' }}>
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
                      <p className="text-[10.5px] text-gray-500 font-medium leading-none mt-1 truncate">View {item.title.toLowerCase()} prospects</p>
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
                {flippedTarget?.contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 w-full bg-white/60 p-2.5 rounded-2xl shadow-sm backdrop-blur-sm border border-white/50">
                    <span className={`text-lg font-black w-6 text-center opacity-60 ${flippedTarget.text}`}>{contact.id}</span>
                    <div className="w-10 h-10 rounded-full bg-black/10 shrink-0 overflow-hidden relative shadow-sm border border-white/80">
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent"></div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center overflow-hidden">
                      <span className="text-[13px] font-bold text-gray-800 leading-tight truncate">{contact.name}</span>
                      <span className="text-[10px] text-gray-600 font-medium">{contact.platform}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold tracking-tight bg-white/50 px-2 py-1 rounded-md shrink-0">{contact.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}