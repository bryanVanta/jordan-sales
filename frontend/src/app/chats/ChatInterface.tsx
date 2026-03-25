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
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const StatusCard = ({ label, count, color, icon }: any) => (
    <div className={`flex flex-col p-4 rounded-2xl border ${color} bg-white/50 backdrop-blur-sm shadow-sm flex-1`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-black">{count}</span>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#f8faff] overflow-hidden p-6 gap-6">
      
      {/* ================= LEFT COLUMN: Customer Selection ================= */}
      <div className="w-[400px] flex flex-col gap-6 animate-in slide-in-from-left-4 duration-500">
        <div className="bg-white/70 backdrop-blur-xl rounded-[32px] border border-white p-6 shadow-xl flex-1 flex flex-col overflow-hidden">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-6">Whatsapp</h2>
          
          {/* Status Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatusCard label="Hot" count="10" color="border-orange-100 text-orange-600" icon={<Flame size={14} />} />
            <StatusCard label="Warm" count="13" color="border-amber-100 text-amber-600" icon={<Zap size={14} />} />
            <StatusCard label="Cold" count="8" color="border-blue-100 text-blue-600" icon={<Snowflake size={14} />} />
            <StatusCard label="Neutral" count="8" color="border-gray-100 text-gray-600" icon={<ShieldCheck size={14} />} />
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
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <button key={i} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/40 border border-transparent hover:border-gray-100 hover:bg-white transition-all group">
                <div className="w-12 h-12 bg-gray-100 rounded-full border border-gray-200" />
                <div className="flex-1 text-left">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[14px] font-black text-gray-900 tracking-tight">Name</span>
                    <span className="text-[10px] font-bold text-gray-400">Time</span>
                  </div>
                  <p className="text-[12px] font-medium text-gray-400 line-clamp-1">Text snippet goes here...</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= MIDDLE COLUMN: Chat Area ================= */}
      <div className="flex-1 flex flex-col bg-white/70 backdrop-blur-xl rounded-[32px] border border-white shadow-xl overflow-hidden relative animate-in zoom-in-95 duration-500">
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none opacity-20">
           {/* Blank chat background as requested */}
        </div>

        {/* Action input bar strictly at the bottom */}
        <div className="p-8 mt-auto">
          <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm flex items-center gap-4 group focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <button className="p-2 bg-gray-50 text-gray-400 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all">
              <Plus size={20} />
            </button>
            <span className="text-gray-300 text-[12px] font-bold cursor-text flex-1">Send File & Image</span>
            <div className="flex items-center gap-2">
              <button className="p-2 text-gray-300 hover:text-gray-600 transition-colors"><Mic size={20} /></button>
              <button className="p-3 bg-blue-600 text-white rounded-[18px] shadow-lg shadow-blue-200 hover:bg-black transition-all">
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT COLUMN: Contact Info ================= */}
      <div className="w-[380px] flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500">
        <div className="bg-white/70 backdrop-blur-xl rounded-[32px] border border-white p-8 shadow-xl flex-1 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><ChevronRight size={18} /></div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Contact Info</h2>
          </div>

          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-32 h-32 bg-gray-100 rounded-full border-4 border-white shadow-xl mb-4" />
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Name</h3>
          </div>

          {/* Media Sections */}
          <div className="space-y-4 mb-10">
            {[
              { label: 'Documents', count: '128 files, 200mb', icon: <FileText size={18} />, color: 'bg-purple-50 text-purple-600' },
              { label: 'Photos', count: '128 files, 200mb', icon: <ImageIcon size={18} />, color: 'bg-orange-50 text-orange-600' },
              { label: 'Other', count: '128 files, 200mb', icon: <Info size={18} />, color: 'bg-cyan-50 text-cyan-600' }
            ].map((media) => (
              <div key={media.label} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-50 group cursor-pointer hover:border-blue-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl ${media.color}`}>{media.icon}</div>
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
                <div className="h-full w-1/4 bg-blue-500 rounded-full" />
                <div className="h-full w-1/4 bg-blue-300 rounded-full" />
                <div className="h-full w-1/4 bg-gray-200/50 rounded-full" />
                <div className="h-full w-1/4 bg-gray-200/50 rounded-full" />
             </div>
          </div>

          {/* Client Progress Tracker */}
          <div className="space-y-3">
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Client Progress Tracker</span>
             {[1, 2, 3, 4].map((i) => (
               <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-50 hover:border-blue-100 cursor-pointer transition-all group">
                 <span className="text-[13px] font-bold text-gray-700">Todo</span>
                 <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-blue-500 transition-colors" />
               </div>
             ))}
          </div>
        </div>
      </div>

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