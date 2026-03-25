"use client";
import React, { Suspense } from 'react';
import Link from 'next/link';
import { LayoutDashboard, MessageCircle, Send, Mail, Users, GraduationCap } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';

const BottomNavContent = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const platform = searchParams.get('platform') || 'whatsapp';
  
  const isChatActive = pathname?.startsWith('/chats');

  const regularItems = [
    { name: 'Dashboard', icon: LayoutDashboard, href: '/', bg: 'bg-[#E1DDFF]', iconCol: 'text-[#5035E4]' },
    { name: 'Leads', icon: Users, href: '/leads', bg: 'bg-[#FEF1CE]', iconCol: 'text-[#C79100]' },
    { name: 'Train', icon: GraduationCap, href: '/training', bg: 'bg-[#D6FBE0]', iconCol: 'text-[#1B893A]' },
  ];

  const chatSubItems = [
    { name: 'WhatsApp', icon: MessageCircle, href: '/chats?platform=whatsapp', id: 'whatsapp', bg: 'bg-[#dcf8c6]', iconCol: 'text-[#075e54]' },
    { name: 'Telegram', icon: Send, href: '/chats?platform=telegram', id: 'telegram', bg: 'bg-[#e3f2fd]', iconCol: 'text-[#0088cc]' },
    { name: 'Email', icon: Mail, href: '/chats?platform=email', id: 'email', bg: 'bg-[#fce4ec]', iconCol: 'text-[#d81b60]' },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-[#0f0f0f]/90 backdrop-blur-md px-4 py-2.5 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex items-center gap-4 border border-white/5 transition-all duration-700 ease-in-out">
        
        {/* Dashboard Link */}
        <Link href="/" className="relative flex flex-col items-center justify-center group shrink-0">
          <div className={`p-2 rounded-full transition-all duration-500 flex items-center justify-center w-[38px] h-[38px] ${regularItems[0].bg} ${pathname === '/' ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105 group-hover:-translate-y-1'}`}>
            <LayoutDashboard size={18} strokeWidth={pathname === '/' ? 2.5 : 2} className={regularItems[0].iconCol} />
          </div>
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white text-black text-[11px] font-black rounded-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none shadow-xl border border-gray-100 flex items-center gap-1.5 whitespace-nowrap z-[60]">
            Dashboard
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-gray-100"></div>
          </div>
          {pathname === '/' && <div className="absolute -bottom-1.5 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_white]"></div>}
        </Link>

        {/* Chat Platform Group - Now with Ultra Smooth Transitions */}
        <div className={`flex items-center transition-all duration-700 ease-in-out ${isChatActive ? 'gap-2 px-1 bg-white/5 rounded-[32px] shadow-inner' : 'gap-0 p-0'}`}>
           
           {/* The Single "Chat" Icon (Only visible when NOT active) */}
           <Link 
             href="/chats?platform=whatsapp" 
             className={`relative flex flex-col items-center shadow-lg justify-center group transition-all duration-700 ease-in-out pointer-events-auto shrink-0 ${isChatActive ? 'w-0 opacity-0 overflow-hidden' : 'w-[42px] opacity-100'}`}
           >
              <div className="p-2.5 rounded-full flex items-center justify-center w-[38px] h-[38px] bg-[#FAD5E4] opacity-80 group-hover:opacity-100 group-hover:scale-105">
                <MessageCircle size={18} strokeWidth={2} className="text-[#D31C63]" />
              </div>
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white text-black text-[11px] font-black rounded-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none shadow-xl border border-gray-100 flex items-center gap-1.5 whitespace-nowrap z-[60]">
                Chat
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-gray-100"></div>
              </div>
           </Link>

           {/* The Platform Icons (Only visible when active) */}
           {chatSubItems.map((item) => {
             const isActive = isChatActive && platform === item.id;
             const Icon = item.icon;
             return (
               <Link 
                 key={item.id} 
                 href={item.href} 
                 className={`relative flex flex-col items-center justify-center group transition-all duration-700 ease-in-out shrink-0 ${isChatActive ? 'w-[42px] opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}
               >
                  <div className={`p-2 rounded-full transition-all duration-500 flex items-center justify-center w-[38px] h-[38px] ${item.bg} ${isActive ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105' : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-110'}`}>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={item.iconCol} />
                  </div>
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white text-black text-[11px] font-black rounded-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none shadow-xl border border-gray-100 flex items-center gap-1.5 whitespace-nowrap z-[60]">
                    {item.name}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-gray-100"></div>
                  </div>
                  {isActive && <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full"></div>}
               </Link>
             )
           })}
        </div>

        {/* Regular Items (Leads, Train) */}
        {regularItems.slice(1).map((item) => {
          const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} className="relative flex flex-col items-center justify-center group shrink-0">
              <div className={`p-2 rounded-full transition-all duration-500 flex items-center justify-center w-[38px] h-[38px] ${item.bg} ${isActive ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105 group-hover:-translate-y-1'}`}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={item.iconCol} />
              </div>
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white text-black text-[11px] font-black rounded-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none shadow-xl border border-gray-100 flex items-center gap-1.5 whitespace-nowrap z-[60]">
                {item.name}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-gray-100"></div>
              </div>
              {isActive && <div className="absolute -bottom-1.5 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_white]"></div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const BottomNav = () => (
  <Suspense fallback={null}>
    <BottomNavContent />
  </Suspense>
);

export default BottomNav;
