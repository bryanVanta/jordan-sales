"use client";

import React, { useState } from "react";
import { 
  Search, 
  Plus, 
  Send, 
  Mic, 
  ChevronRight, 
  Paperclip, 
  MoreVertical,
  Flame,
  Zap,
  Snowflake,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Info
} from "lucide-react";

const ChatInterface = () => {
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);

  const StatusCard = ({ label, count, colorClass, icon }: any) => (
    <div className={`flex flex-col p-4 rounded-2xl border ${colorClass} shadow-sm flex-1`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-black">{count}</span>
    </div>
  );

  return (
    // We use absolute positioning to completely take over the scrollable area and make it strictly unscrollable
    <div className="absolute inset-0 flex p-5 gap-3 overflow-hidden pb-[120px]">
      <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none -z-10"></div>
      
      {/* ================= LEFT COLUMN: Customer Selection ================= */}
      <div className="w-[380px] flex flex-col h-full animate-in slide-in-from-left-4 duration-500">
        <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white p-5 shadow-xl flex flex-col h-full overflow-hidden">
          
          {/* Status Grid matching Dashboard Aesthetics */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatusCard label="Hot" count="10" colorClass="border-red-200 bg-red-50 text-red-600" icon={<Flame size={14} className="text-red-500" />} />
            <StatusCard label="Warm" count="13" colorClass="border-orange-200 bg-orange-50 text-orange-600" icon={<Zap size={14} className="text-orange-500" />} />
            <StatusCard label="Cold" count="8" colorClass="border-blue-200 bg-blue-50 text-blue-600" icon={<Snowflake size={14} className="text-blue-500" />} />
            <StatusCard label="Neutral" count="8" colorClass="border-gray-200 bg-gray-50 text-gray-600" icon={<ShieldCheck size={14} className="text-gray-500" />} />
          </div>

          {/* Search Bar */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input 
              type="text"
              placeholder="Search"
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-[13px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </div>

          {/* Customer List */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2 pb-10">
            {[
              { id: 1, name: "Sarah Jenkins", text: "I'm ready to proceed with the enterprise plan.", time: "10:15 AM", active: true },
              { id: 2, name: "David Chen", text: "Can you send me the pricing for 50 seats?", time: "10:02 AM", active: false },
              { id: 3, name: "Alex Thompson", text: "Just looking around for now, thanks.", time: "Yesterday", active: false },
              { id: 4, name: "Marcus Wright", text: "How do I integrate the API with our CRM?", time: "Yesterday", active: false },
              { id: 5, name: "Elena Rodriguez", text: "Excellent! Let's schedule a demo.", time: "Tuesday", active: false },
              { id: 6, name: "James Wilson", text: "I need support with my current setup.", time: "Monday", active: false },
            ].map((customer) => (
              <button 
                key={customer.id} 
                onClick={() => setSelectedCustomer(customer.id)}
                onDoubleClick={() => {
                  setSelectedCustomer(customer.id);
                  setShowContactInfo(true);
                }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all group ${
                  selectedCustomer === customer.id 
                    ? "bg-blue-50 border-blue-200 shadow-sm" 
                    : "bg-white border-transparent hover:border-gray-100 hover:bg-gray-50"
                }`}
                title="Double click to view Contact Info"
              >
                <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold overflow-hidden ${
                  selectedCustomer === customer.id ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 border-gray-200 text-gray-400"
                }`}>
                  {customer.name.substring(0, 1)}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-[14px] font-black tracking-tight truncate ${selectedCustomer === customer.id ? "text-blue-900" : "text-gray-900"}`}>
                      {customer.name}
                    </span>
                    <span className={`text-[10px] font-bold ${selectedCustomer === customer.id ? "text-blue-500" : "text-gray-400"}`}>
                      {customer.time}
                    </span>
                  </div>
                  <p className={`text-[12px] font-medium line-clamp-1 ${selectedCustomer === customer.id ? "text-blue-700/70" : "text-gray-400"}`}>
                    {customer.text}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= MIDDLE COLUMN: Chat Area ================= */}
      <div className="flex-1 flex flex-col bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white shadow-xl h-full overflow-hidden relative animate-in zoom-in-95 duration-500">
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none opacity-20">
           {/* Blank chat background as requested */}
        </div>

        {/* Action input bar strictly at the bottom */}
        <div className="p-8 mt-auto border-t border-gray-50/50">
          <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex items-center gap-4 group focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-200 transition-all">
            <button className="p-2 bg-gray-50 text-gray-400 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all">
              <Plus size={20} />
            </button>
            <input 
              type="text"
              placeholder="Send File & Image" 
              className="text-gray-800 text-[13px] font-bold flex-1 bg-transparent outline-none placeholder:text-gray-300"
            />
            <div className="flex items-center gap-2">
              <button className="p-2 text-gray-300 hover:text-gray-600 transition-colors"><Mic size={20} /></button>
              <button className="p-3 bg-blue-600 text-white rounded-[18px] shadow-[0_10px_20px_rgba(37,99,235,0.3)] hover:bg-black hover:-translate-y-0.5 transition-all">
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT COLUMN: Contact Info (Toggled) ================= */}
      {showContactInfo && (
        <div className="w-[360px] flex flex-col animate-in slide-in-from-right-4 duration-500 h-full">
          <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white p-6 shadow-xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setShowContactInfo(false)} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <ChevronRight size={18} />
              </button>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Contact Info</h2>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
              <div className="flex flex-col items-center mb-10 text-center">
                <div className="w-32 h-32 bg-gray-100 rounded-full border-4 border-white shadow-xl mb-4 flex items-center justify-center overflow-hidden">
                  <span className="text-5xl font-black text-gray-300">S</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Sarah Jenkins</h3>
              </div>

              {/* Media Sections */}
              <div className="space-y-4 mb-10">
                {[
                  { label: 'Documents', count: '128 files, 200mb', icon: <FileText size={18} />, color: 'bg-purple-50 border-purple-100 text-purple-600' },
                  { label: 'Photos', count: '128 files, 200mb', icon: <ImageIcon size={18} />, color: 'bg-orange-50 border-orange-100 text-orange-600' },
                  { label: 'Other', count: '128 files, 200mb', icon: <Info size={18} />, color: 'bg-cyan-50 border-cyan-100 text-cyan-600' }
                ].map((media) => (
                  <div key={media.label} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 group cursor-pointer hover:border-blue-200 transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl border ${media.color}`}>{media.icon}</div>
                      <div>
                        <h4 className="text-[13px] font-black text-gray-900">{media.label}</h4>
                        <p className="text-[10px] font-bold text-gray-400">{media.count}</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                ))}
              </div>

              {/* Progress Section */}
              <div className="mb-10">
                 <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Temperature Progress</span>
                 </div>
                 <div className="h-4 w-full bg-gray-100 rounded-full flex overflow-hidden p-1 gap-1">
                    <div className="h-full w-1/4 bg-red-500 rounded-full" />
                    <div className="h-full w-1/4 bg-orange-400 rounded-full" />
                    <div className="h-full w-1/4 bg-blue-400 rounded-full" />
                    <div className="h-full w-1/4 bg-gray-200/50 rounded-full" />
                 </div>
              </div>

              {/* Client Progress Tracker */}
              <div className="space-y-3">
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Client Progress Tracker</span>
                 {[1, 2, 3, 4].map((i) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-blue-200 cursor-pointer transition-all group shadow-sm">
                     <span className="text-[13px] font-bold text-gray-700">Send introductory email</span>
                     <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-blue-500 transition-colors bg-gray-50" />
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
};

export default ChatInterface;