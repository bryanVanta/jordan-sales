"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Search, 
  Plus, 
  Send, 
  Mic, 
  ChevronRight, 
  TrendingUp,
  Sun,
  Cloud,
  CheckCircle2,
  Flame,
  Snowflake,
  FileText,
  Image as ImageIcon,
  Info,
  Navigation,
  CheckCheck
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
}

interface MediaItem {
  label: string;
  count: string;
  icon: any;
  border: string;
  bg: string;
  text: string;
}

interface CustomerData {
  id: number;
  name: string;
  time: string;
  messages: Message[];
  media: { label: string, count: string }[];
  progress: string[];
  temperature: number; // 0 to 100
}

const CUSTOMERS: CustomerData[] = [
  { 
    id: 1, 
    name: "Sarah Jenkins", 
    time: "10:15 AM", 
    messages: [
      { id: "s1", sender: "user", text: "Hi, I'm interested in the hotel management system.", time: "10:15 AM" },
      { id: "s2", sender: "bot", text: "Hello! Jordan can help. Do you need multi-location sync?", time: "10:16 AM" },
      { id: "s3", sender: "user", text: "Yes, we have 5 locations currently.", time: "10:20 AM" },
      { id: "s4", sender: "bot", text: "Perfect. We offer a central cloud dashboard for all sites.", time: "10:22 AM" },
    ],
    media: [
      { label: 'Documents', count: '12 files, 45mb' },
      { label: 'Photos', count: '5 files, 12mb' },
    ],
    progress: ["Send introductory email", "Schedule demo call", "Review pricing structure"],
    temperature: 65,
  },
  { 
    id: 2, 
    name: "David Chen", 
    time: "10:02 AM", 
    messages: [
      { id: "d1", sender: "user", text: "Can you send the pricing for 50 seats?", time: "10:02 AM" },
    ],
    media: [
      { label: 'Documents', count: '2 files, 5mb' },
    ],
    progress: ["Confirm user count", "Generate custom quote"],
    temperature: 45,
  },
  { 
    id: 3, 
    name: "Alex Thompson", 
    time: "Yesterday", 
    messages: [
      { id: "a1", sender: "user", text: "Just looking around for now, thanks.", time: "4:30 PM" },
    ],
    media: [],
    progress: ["Follow up in 2 weeks"],
    temperature: 20,
  },
  { 
    id: 4, 
    name: "Marcus Wright", 
    time: "Yesterday", 
    messages: [
      { id: "m1", sender: "user", text: "How do I integrate API with our CRM?", time: "2:15 PM" },
    ],
    media: [
      { label: 'Documents', count: '8 files, 20mb' },
      { label: 'Other', count: '1 file, 2mb' },
    ],
    progress: ["Share API docs", "Assist with sandbox setup"],
    temperature: 85,
  },
];

const DEFAULT_MEDIA: MediaItem[] = [
  { label: 'Documents', count: '0 files, 0mb', icon: <FileText size={16} />, border: 'border-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
  { label: 'Photos', count: '0 files, 0mb', icon: <ImageIcon size={16} />, border: 'border-orange-100', bg: 'bg-orange-50', text: 'text-orange-600' },
  { label: 'Other', count: '0 files, 0mb', icon: <Info size={16} />, border: 'border-cyan-100', bg: 'bg-cyan-50', text: 'text-cyan-600' }
];

const ChatInterface = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [showContactInfo, setShowContactInfo] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [allCustomers, setAllCustomers] = useState<CustomerData[]>(CUSTOMERS);
  const [activeView, setActiveView] = useState<'list' | 'chat' | 'info'>('list');
  
  const currentCustomer = allCustomers.find(c => c.id === selectedCustomerId) || allCustomers[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowPlusMenu(false);
  }, [selectedCustomerId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentCustomer.messages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAllCustomers(prev => prev.map(c => 
      c.id === selectedCustomerId 
        ? { ...c, messages: [...c.messages, { id: Date.now().toString(), sender: "bot", text: inputValue, time }] } 
        : c
    ));
    setInputValue("");
  };

  const getMediaData = () => {
    return DEFAULT_MEDIA.map(def => {
      const match = currentCustomer.media.find(m => m.label === def.label);
      return match ? { ...def, count: match.count } : def;
    });
  };

  const StatusCard = ({ label, count, bg, text, border, icon: Icon, trend }: any) => (
    <div className={`${bg} p-2.5 sm:p-3.5 rounded-[22px] flex flex-col border ${border} justify-center group hover:brightness-95 transition-all relative overflow-hidden h-[80px] sm:h-[100px] flex-1`}>
      <Icon size={40} strokeWidth={1} className={`absolute -right-1 -bottom-1 ${text} opacity-20`} />
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1 z-10">
        <span className={`${text} font-bold text-[9px] sm:text-[11px]`}>{label}</span>
        <div className={`bg-white/60 ${text} px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold flex items-center gap-0.5 shadow-sm border border-white/50`}>
           <TrendingUp size={9} strokeWidth={3} /> {trend}
        </div>
      </div>
      <div className={`flex items-end gap-1 ${text} z-10`}>
        <span className="text-2xl sm:text-3xl font-black tracking-tighter">{count}</span>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 flex p-3 sm:p-4 gap-3 overflow-hidden pb-[20px] h-full">
      <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none -z-10"></div>
      
      {/* ================= LEFT COLUMN: Customer Selection ================= */}
      <div className={`w-full lg:w-[360px] lg:flex flex-col h-full animate-in slide-in-from-left-4 duration-500 ${activeView === 'list' ? 'flex' : 'hidden'}`}>
        <div className="bg-white/90 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white p-3 sm:p-4 shadow-xl flex flex-col h-full overflow-hidden">
          
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 mb-4">
            <StatusCard label="Hot" count="42" trend="+12" bg="bg-[#FFF0EB]" text="text-orange-600" border="border-orange-100" icon={Flame} />
            <StatusCard label="Cold" count="18" trend="+3" bg="bg-[#EBF4FF]" text="text-blue-600" border="border-blue-100" icon={Snowflake} />
            <StatusCard label="Warm" count="27" trend="+8" bg="bg-[#FFFDF0]" text="text-yellow-600" border="border-yellow-100" icon={Sun} />
            <StatusCard label="Neutral" count="9" trend="+1" bg="bg-gray-50" text="text-gray-600" border="border-gray-200" icon={Cloud} />
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input 
              type="text"
              placeholder="Search"
              className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-[12px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-inner"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-1.5 pb-28">
            {allCustomers.map((customer) => {
              const lastMsg = customer.messages.length > 0 ? customer.messages[customer.messages.length - 1].text : "No messages";
              return (
                <button 
                  key={customer.id} 
                  onClick={() => {
                    setSelectedCustomerId(customer.id);
                    setActiveView('chat');
                  }}
                  onDoubleClick={() => {
                    setSelectedCustomerId(customer.id);
                    setShowContactInfo(true);
                    setActiveView('chat');
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border border-transparent transition-all group relative overflow-hidden ${
                    selectedCustomerId === customer.id 
                      ? "shadow-sm" 
                      : "bg-white hover:bg-gray-50/50"
                  }`}
                >
                  {selectedCustomerId === customer.id && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-blue-50/30 to-transparent pointer-events-none" />
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 relative z-10 ${
                    selectedCustomerId === customer.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}>
                    {customer.name.substring(0, 1)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-[13px] font-black tracking-tight truncate relative z-10 ${selectedCustomerId === customer.id ? "text-blue-900" : "text-gray-900"}`}>
                      {customer.name}
                    </span>
                    <span className={`text-[9px] font-bold relative z-10 ${selectedCustomerId === customer.id ? "text-blue-500" : "text-gray-400"}`}>
                      {customer.time}
                    </span>
                  </div>
                  <p className={`text-[11px] font-medium truncate relative z-10 ${selectedCustomerId === customer.id ? "text-blue-700/60" : "text-gray-400"}`}>
                    {lastMsg}
                  </p>
                </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ================= MIDDLE COLUMN: Chat Area ================= */}
      <div className={`flex-1 lg:flex flex-col bg-white/90 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white shadow-xl h-full overflow-hidden relative animate-in zoom-in-95 duration-500 ${activeView === 'chat' ? 'flex' : 'hidden'}`}>
        
        {/* Mobile Header (back button) */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-50 bg-white/50">
          <button onClick={() => setActiveView('list')} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-600 transition-all active:scale-95">
             <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex flex-col items-center">
             <span className="text-[13px] font-black text-gray-900 leading-tight">{currentCustomer.name}</span>
             <span className="text-[10px] font-bold text-blue-500">{currentCustomer.time}</span>
          </div>
          <button onClick={() => setActiveView('info')} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-600 transition-all active:scale-95">
             <Info size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar bg-gray-50/20">
          {currentCustomer.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'bot' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`flex flex-col max-w-[75%] ${msg.sender === 'bot' ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 rounded-2xl text-[13px] font-bold leading-relaxed shadow-sm ${
                  msg.sender === 'bot' ? "bg-blue-600 text-white rounded-tr-none" : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                }`}>
                  {msg.text}
                </div>
                <div className="flex items-center gap-1 mt-1 opacity-50 px-1">
                  <span className="text-[9px] font-bold text-gray-400">{msg.time}</span>
                  {msg.sender === 'bot' && <CheckCheck size={10} className="text-blue-500" />}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 pb-[100px] mt-auto border-t border-gray-50/50 bg-white/50">
          <div className="bg-white border border-gray-100 rounded-[24px] p-2 sm:p-2.5 shadow-sm flex items-center gap-2 sm:gap-3 transition-all relative">
            <div className="relative">
              <button 
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={`p-2 rounded-xl transition-all ${showPlusMenu ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
              >
                <Plus size={18} />
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-3 w-40 bg-white border border-gray-100 rounded-2xl shadow-2xl p-2 z-50 animate-in slide-in-from-bottom-2">
                  <input 
                    type="file" 
                    ref={imageInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      console.log("Image selected:", e.target.files?.[0]);
                      setShowPlusMenu(false);
                    }}
                  />
                  <input 
                    type="file" 
                    ref={docInputRef} 
                    className="hidden" 
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      console.log("Doc selected:", e.target.files?.[0]);
                      setShowPlusMenu(false);
                    }}
                  />
                  <button 
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl text-[12px] font-bold text-gray-700"
                  >
                     <ImageIcon size={14} className="text-blue-500" /> Add Image
                  </button>
                  <button 
                    onClick={() => docInputRef.current?.click()}
                    className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl text-[12px] font-bold text-gray-700"
                  >
                     <FileText size={14} className="text-purple-500" /> Add Doc
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <input 
                type="text"
                placeholder="Type your message..."
                className="text-gray-800 text-[13px] font-bold w-full bg-transparent outline-none placeholder:text-gray-300"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button className="p-2 text-gray-300 hover:text-gray-600 transition-colors"><Mic size={18} /></button>
              <button 
                onClick={() => handleSendMessage()}
                className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 hover:bg-black transition-all active:scale-95"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT COLUMN: Contact Info ================= */}
      {(showContactInfo || activeView === 'info') && (
        <div className={`w-full lg:w-[340px] xl:flex flex-col h-full animate-in slide-in-from-right-4 duration-500 ${activeView === 'info' ? 'flex' : (showContactInfo && activeView === 'chat' ? 'hidden xl:flex' : 'hidden')}`}>
          <div className="bg-white/90 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white p-4 sm:p-5 shadow-xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => activeView === 'info' ? setActiveView('chat') : setShowContactInfo(false)} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                  <ChevronRight size={16} />
                </button>
                <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Contact Info</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar pb-32">
              <div className="flex flex-col items-center mb-6 text-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full shadow-lg mb-3 flex items-center justify-center font-black text-3xl text-gray-300">
                  {currentCustomer.name.substring(0, 1)}
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">{currentCustomer.name}</h3>
              </div>

              {/* Media Sections: Always SHOW ALL */}
              <div className="space-y-2 mb-6">
                {getMediaData().map((media) => (
                  <div key={media.label} className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-50 group cursor-pointer hover:border-blue-200 transition-all shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${media.border} ${media.bg} ${media.text}`}>{media.icon}</div>
                      <div>
                        <h4 className="text-[12px] font-black text-gray-900">{media.label}</h4>
                        <p className="text-[9px] font-bold text-gray-400">{media.count}</p>
                      </div>
                    </div>
                    <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-600" />
                  </div>
                ))}
              </div>

              {/* Temperature Progress Sync */}
              <div className="mb-6 p-1">
                 <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Temperature Progress</span>
                 </div>
                 <div className="relative pt-4">
                    <div 
                      className="absolute top-0 transition-all duration-1000 ease-in-out flex flex-col items-center" 
                      style={{ left: `${currentCustomer.temperature}%` }}
                    >
                      <Navigation size={12} className="text-blue-600 rotate-180 fill-blue-600" />
                    </div>
                    <div className="h-3 w-full bg-gray-100 rounded-full flex overflow-hidden p-0.5 gap-0.5 shadow-inner">
                      <div className="h-full w-1/4 bg-gray-300 rounded-full cursor-pointer transition-all hover:brightness-110" title="Cold" />
                      <div className="h-full w-1/4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.4)] cursor-pointer transition-all hover:brightness-110" title="Neutral" />
                      <div className="h-full w-1/4 bg-orange-400 rounded-full cursor-pointer transition-all hover:brightness-110" title="Warm" />
                      <div className="h-full w-1/4 bg-red-500 rounded-full cursor-pointer transition-all hover:brightness-110" title="Hot" />
                    </div>
                 </div>
              </div>

              {/* Progress Tracker Sync */}
              <div className="space-y-2">
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Progress Tracker</span>
                 {currentCustomer.progress.map((todo, i) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-full bg-white border border-gray-100 hover:border-blue-200 cursor-pointer transition-all group overflow-hidden relative">
                     <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                     <span className="text-[12px] font-bold text-gray-800 relative z-10">{todo}</span>
                     <div className="relative z-10">
                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-blue-500 transition-all flex items-center justify-center">
                          <CheckCircle2 size={12} className="text-blue-500 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all" />
                        </div>
                     </div>
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 0px; display: none; }
        .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default ChatInterface;