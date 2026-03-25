"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Search, 
  Plus, 
  Send, 
  Mic, 
  ChevronRight, 
  Flame,
  Zap,
  Snowflake,
  ShieldCheck,
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

interface CustomerData {
  id: number;
  name: string;
  time: string;
  messages: Message[];
  media: { label: string, count: string, icon: any, border: string, bg: string, text: string }[];
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
      { label: 'Documents', count: '12 files, 45mb', icon: <FileText size={16} />, border: 'border-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
      { label: 'Photos', count: '5 files, 12mb', icon: <ImageIcon size={16} />, border: 'border-orange-100', bg: 'bg-orange-50', text: 'text-orange-600' },
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
      { label: 'Documents', count: '2 files, 5mb', icon: <FileText size={16} />, border: 'border-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
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
      { label: 'Documents', count: '8 files, 20mb', icon: <FileText size={16} />, border: 'border-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
    ],
    progress: ["Share API docs", "Assist with sandbox setup"],
    temperature: 85,
  },
];

const ChatInterface = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [showContactInfo, setShowContactInfo] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  
  const currentCustomer = CUSTOMERS.find(c => c.id === selectedCustomerId) || CUSTOMERS[0];
  const [messages, setMessages] = useState<Message[]>(currentCustomer.messages);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(currentCustomer.messages);
    setShowPlusMenu(false);
  }, [selectedCustomerId, currentCustomer]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: "bot",
      text: inputValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages([...messages, newMsg]);
    setInputValue("");
  };

  const StatusCard = ({ label, count, colorClass, icon }: any) => (
    <div className={`flex flex-col p-3 rounded-2xl border ${colorClass} shadow-sm flex-1`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-80">{label}</span>
        {icon}
      </div>
      <span className="text-xl font-black">{count}</span>
    </div>
  );

  return (
    <div className="absolute inset-0 flex p-4 gap-3 overflow-hidden pb-[20px] h-full">
      <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none -z-10"></div>
      
      {/* ================= LEFT COLUMN: Customer Selection ================= */}
      <div className="w-[360px] flex flex-col h-full animate-in slide-in-from-left-4 duration-500">
        <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white p-4 shadow-xl flex flex-col h-full overflow-hidden">
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatusCard label="Hot" count="10" colorClass="border-red-200 bg-red-100 text-red-600" icon={<Flame size={14} className="text-red-500" />} />
            <StatusCard label="Warm" count="13" colorClass="border-orange-200 bg-orange-100 text-orange-600" icon={<Zap size={14} className="text-orange-500" />} />
            <StatusCard label="Cold" count="8" colorClass="border-blue-200 bg-blue-100 text-blue-600" icon={<Snowflake size={14} className="text-blue-500" />} />
            <StatusCard label="Neutral" count="8" colorClass="border-gray-200 bg-gray-100 text-gray-600" icon={<ShieldCheck size={14} className="text-gray-500" />} />
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
            {CUSTOMERS.map((customer) => {
              const lastMsg = messages.length > 0 && selectedCustomerId === customer.id ? messages[messages.length - 1].text : customer.messages[customer.messages.length - 1].text;
              return (
                <button 
                  key={customer.id} 
                  onClick={() => setSelectedCustomerId(customer.id)}
                  onDoubleClick={() => {
                    setSelectedCustomerId(customer.id);
                    setShowContactInfo(true);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all group ${
                    selectedCustomerId === customer.id 
                      ? "bg-blue-50 border-blue-200 shadow-sm" 
                      : "bg-white border-transparent hover:border-gray-100 hover:bg-gray-50/50"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold shrink-0 ${
                    selectedCustomerId === customer.id ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 border-gray-200 text-gray-400"
                  }`}>
                    {customer.name.substring(0, 1)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`text-[13px] font-black tracking-tight truncate ${selectedCustomerId === customer.id ? "text-blue-900" : "text-gray-900"}`}>
                        {customer.name}
                      </span>
                      <span className={`text-[9px] font-bold ${selectedCustomerId === customer.id ? "text-blue-500" : "text-gray-400"}`}>
                        {customer.time}
                      </span>
                    </div>
                    <p className={`text-[11px] font-medium truncate ${selectedCustomerId === customer.id ? "text-blue-700/60" : "text-gray-400"}`}>
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
      <div className="flex-1 flex flex-col bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white shadow-xl h-full overflow-hidden relative animate-in zoom-in-95 duration-500">
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-50/20">
          {messages.map((msg) => (
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

        <div className="p-6 pb-[100px] mt-auto border-t border-gray-50/50 bg-white/50">
          <div className="bg-white border border-gray-100 rounded-[24px] p-2.5 shadow-sm flex items-center gap-3 transition-all relative">
            <div className="relative">
              <button 
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={`p-2 rounded-xl transition-all ${showPlusMenu ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
              >
                <Plus size={18} />
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-3 w-40 bg-white border border-gray-100 rounded-2xl shadow-2xl p-2 z-50 animate-in slide-in-from-bottom-2">
                  <button className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl text-[12px] font-bold text-gray-700">
                     <ImageIcon size={14} className="text-blue-500" /> Add Image
                  </button>
                  <button className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl text-[12px] font-bold text-gray-700">
                     <FileText size={14} className="text-purple-500" /> Add Doc
                  </button>
                </div>
              )}
            </div>
            <input 
              type="text"
              placeholder="Type your message..." 
              className="text-gray-800 text-[13px] font-bold flex-1 bg-transparent outline-none placeholder:text-gray-300"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
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
      {showContactInfo && (
        <div className="w-[340px] flex flex-col h-full animate-in slide-in-from-right-4 duration-500">
          <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] border border-white p-5 shadow-xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setShowContactInfo(false)} className="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <ChevronRight size={16} />
              </button>
              <h2 className="text-lg font-black text-gray-900 tracking-tight">Contact Info</h2>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar pb-32">
              <div className="flex flex-col items-center mb-6 text-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full border-4 border-white shadow-lg mb-3 flex items-center justify-center font-black text-3xl text-gray-300">
                  {currentCustomer.name.substring(0, 1)}
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">{currentCustomer.name}</h3>
              </div>

              {/* Media Sections Sync */}
              <div className="space-y-2 mb-6">
                {currentCustomer.media.length > 0 ? currentCustomer.media.map((media) => (
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
                )) : (
                  <div className="text-center p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No Media Found</p>
                  </div>
                )}
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
                      <div className="h-full w-1/4 bg-gray-300 rounded-full" />
                      <div className="h-full w-1/4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                      <div className="h-full w-1/4 bg-orange-400 rounded-full" />
                      <div className="h-full w-1/4 bg-red-500 rounded-full" />
                    </div>
                 </div>
              </div>

              {/* Progress Tracker Sync */}
              <div className="space-y-2">
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Progress Tracker</span>
                 {currentCustomer.progress.map((todo, i) => (
                   <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-50 hover:border-blue-100 cursor-pointer transition-all group shadow-sm">
                     <span className="text-[11px] font-bold text-gray-700">{todo}</span>
                     <div className="w-4 h-4 rounded-full border-2 border-gray-200 group-hover:border-blue-500 transition-colors" />
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
};

export default ChatInterface;