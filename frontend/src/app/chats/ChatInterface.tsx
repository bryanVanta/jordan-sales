"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Search, 
  Send, 
  MoreVertical, 
  Phone, 
  Video, 
  User, 
  CheckCheck,
  Zap,
  Flame,
  Snowflake,
  ShieldCheck,
  ChevronRight,
  Plus,
  MessageSquare
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  status?: "sent" | "delivered" | "read";
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  status: "HOT" | "WARM" | "COLD" | "LEAD";
  lastMessage: string;
  lastActive: string;
  avatar?: string;
}

const INITIAL_CUSTOMERS: Customer[] = [
  { id: "1", name: "Sarah Jenkins", phone: "+60 12 345 6789", status: "HOT", lastMessage: "I'm ready to proceed with the enterprise plan.", lastActive: "2m ago" },
  { id: "2", name: "David Chen", phone: "+60 19 876 5432", status: "WARM", lastMessage: "Can you send me the pricing for 50 seats?", lastActive: "15m ago" },
  { id: "3", name: "Alex Thompson", phone: "+60 12 345 6780", status: "COLD", lastMessage: "Just looking around for now, thanks.", lastActive: "1h ago" },
  { id: "4", name: "Marcus Wright", phone: "+60 11 234 5678", status: "LEAD", lastMessage: "How do I integrate the API with our CRM?", lastActive: "3h ago" },
  { id: "5", name: "Elena Rodriguez", phone: "+60 14 567 8901", status: "HOT", lastMessage: "Excellent! Let's schedule a demo.", lastActive: "Just now" },
];

const INITIAL_MESSAGES: Message[] = [
  { id: "1", sender: "user", text: "Hello, I'm interested in the enterprise features.", timestamp: "10:15 AM", status: "read" },
  { id: "2", sender: "bot", text: "Hi! I'd love to help with that. Are you looking for seat-based pricing or a site-wide license?", timestamp: "10:16 AM", status: "read" },
  { id: "3", sender: "user", text: "Site-wide license. We have about 450 users.", timestamp: "10:20 AM", status: "read" },
  { id: "4", sender: "bot", text: "Great. For 450 users, our enterprise plan offers the best value with a dedicated account manager and 24/7 support.", timestamp: "10:22 AM", status: "read" },
];

export default function ChatInterface() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (selectedCustomer) {
      setMessages(INITIAL_MESSAGES); // Simulate loading history
    }
  }, [selectedCustomer]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !selectedCustomer) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: "bot", 
      text: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "sent"
    };

    setMessages([...messages, newMessage]);
    setInputValue("");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HOT": return <Flame size={12} className="text-orange-500 fill-orange-500" />;
      case "WARM": return <Zap size={12} className="text-amber-500 fill-amber-500" />;
      case "COLD": return <Snowflake size={12} className="text-blue-400" />;
      case "LEAD": return <ShieldCheck size={12} className="text-emerald-500" />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full -mt-10 px-8 pb-32 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      
      <div className="flex h-[calc(100vh-280px)] gap-6 z-10">
        
        {/* ================= CUSTOMER LIST SIDEBAR ================= */}
        <div className="w-[380px] flex flex-col bg-white/70 backdrop-blur-2xl rounded-[32px] border border-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] animate-in slide-in-from-left-4 duration-500">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Conversations</h2>
            <button className="p-2.5 bg-gray-50 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm">
              <Plus size={20} />
            </button>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input 
              type="text"
              placeholder="Search customers..."
              className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-[13px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 focus:bg-white outline-none transition-all placeholder:text-gray-300"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {INITIAL_CUSTOMERS.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map((customer) => (
              <button 
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border group ${
                  selectedCustomer?.id === customer.id 
                    ? "bg-blue-600 border-blue-600 shadow-[0_10px_20px_rgba(37,99,235,0.2)]" 
                    : "bg-white/40 border-transparent hover:border-gray-100 hover:bg-white/80"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black transition-colors ${
                   selectedCustomer?.id === customer.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600"
                }`}>
                  {customer.name.substring(0, 1)}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[14px] font-black truncate tracking-tight ${selectedCustomer?.id === customer.id ? "text-white" : "text-gray-900"}`}>
                      {customer.name}
                    </span>
                    <span className={`text-[10px] font-bold ${selectedCustomer?.id === customer.id ? "text-white/60" : "text-gray-400"}`}>
                      {customer.lastActive}
                    </span>
                  </div>
                  <p className={`text-[12px] font-medium truncate ${selectedCustomer?.id === customer.id ? "text-white/80" : "text-gray-500"}`}>
                    {customer.lastMessage}
                  </p>
                </div>
                {selectedCustomer?.id !== customer.id && (
                  <div className="p-1.5 bg-gray-50 rounded-lg group-hover:bg-white transition-colors">
                    {getStatusIcon(customer.status)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>


        {/* ================= CHAT MAIN AREA ================= */}
        <div className="flex-1 flex flex-col bg-white/70 backdrop-blur-2xl rounded-[32px] border border-white shadow-[0_20px_50px_rgba(0,0,0,0.04)] overflow-hidden animate-in slide-in-from-right-4 duration-500">
          
          {selectedCustomer ? (
            <>
              {/* Chat Header */}
              <div className="px-8 py-5 border-b border-gray-50 flex items-center justify-between bg-white/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xl border border-blue-100">
                    {selectedCustomer.name.substring(0, 1)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-black text-gray-900 tracking-tight">{selectedCustomer.name}</h3>
                      <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                        {getStatusIcon(selectedCustomer.status)}
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{selectedCustomer.status}</span>
                      </div>
                    </div>
                    <span className="text-[12px] font-bold text-gray-400">{selectedCustomer.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Phone size={20} /></button>
                  <button className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Video size={20} /></button>
                  <div className="w-px h-6 bg-gray-100 mx-2" />
                  <button className="p-3 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"><MoreVertical size={20} /></button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-gray-50/10">
                <div className="flex justify-center">
                  <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] bg-white px-4 py-1.5 rounded-full border border-gray-50 shadow-sm">
                    Today, 24 March
                  </span>
                </div>
                {messages.map((msg, i) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'bot' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                    <div className={`flex flex-col max-w-[70%] ${msg.sender === 'bot' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-5 py-3.5 rounded-[22px] text-[14px] font-bold leading-relaxed shadow-sm ${
                        msg.sender === 'bot' ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-100 text-gray-800 rounded-bl-none"
                      }`}>
                        {msg.text}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 px-1">
                        <span className="text-[10px] font-bold text-gray-400 opacity-60 uppercase">{msg.timestamp}</span>
                        {msg.sender === 'bot' && <CheckCheck size={12} className="text-blue-500" />}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-6 bg-white/50 backdrop-blur-md border-t border-gray-50">
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input type="text" placeholder={`Reply to ${selectedCustomer.name}...`} className="w-full bg-white border border-gray-100 rounded-[22px] py-4 pl-6 pr-14 text-[14px] font-bold text-gray-800 focus:ring-4 focus:ring-blue-100 outline-none transition-all placeholder:text-gray-300 shadow-sm" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-black transition-all shadow-lg active:scale-90"><Send size={18} /></button>
                  </div>
                  <button type="button" className="p-4 bg-white border border-gray-100 rounded-[22px] text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"><Zap size={22} /></button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-20 animate-in fade-in zoom-in duration-500">
               <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-300 border border-blue-50 mb-6">
                 <MessageSquare size={44} />
               </div>
               <h3 className="text-xl font-black text-gray-900 tracking-tight mb-2">Select a Conversation</h3>
               <p className="text-[14px] font-bold text-gray-400 max-w-[280px] leading-relaxed">
                 Choose a customer from the sidebar to view their lead status and start communicating.
               </p>
            </div>
          )}
        </div>

      </div>

      {/* Floating Action footer like other pages */}
      <div className="fixed bottom-[60px] left-0 right-0 px-20 pointer-events-none z-50">
        <div className="flex items-center justify-between w-full max-w-[1600px] mx-auto pointer-events-auto">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 bg-gray-900 border border-white/10 text-white px-8 py-4 rounded-[22px] font-black text-[12px] tracking-[0.1em] shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1 uppercase">
              <Plus size={16} className="text-blue-500" /> New Chat
            </button>
          </div>
          <button className="flex items-center gap-3 bg-blue-600 text-white px-10 py-4 rounded-[22px] font-black text-[12px] tracking-[0.2em] shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:bg-black hover:-translate-y-1 transition-all active:scale-95 uppercase group border border-white/10">
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" /> 
            Automate Response
          </button>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
}