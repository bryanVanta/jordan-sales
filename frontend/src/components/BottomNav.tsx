"use client";
import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, MessageCircle, Users, GraduationCap } from 'lucide-react';
import { usePathname } from 'next/navigation';

const BottomNav = () => {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, href: '/', bg: 'bg-[#E1DDFF]', iconCol: 'text-[#5035E4]' },
    { name: 'Chat', icon: MessageCircle, href: '/chats', bg: 'bg-[#FAD5E4]', iconCol: 'text-[#D31C63]' },
    { name: 'Customer', icon: Users, href: '/project', bg: 'bg-[#FEF1CE]', iconCol: 'text-[#C79100]' },
    { name: 'Train', icon: GraduationCap, href: '/training', bg: 'bg-[#D6FBE0]', iconCol: 'text-[#1B893A]' },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      
      {/* Main Black Nav Pill - Slighly tighter padding and smaller circles */}
      <div className="bg-[#0f0f0f]/90 backdrop-blur-md px-5 py-3 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex items-center space-x-6 border border-white/5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} className="relative flex flex-col items-center justify-center group">
              {/* Smaller Circles and Icons */}
              <div className={`p-2.5 rounded-full transition-all duration-500 flex items-center justify-center w-[44px] h-[44px] ${item.bg} ${isActive ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105 group-hover:-translate-y-1'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={item.iconCol} />
              </div>

              {/* Hover Label Popup Animation */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white text-black text-[11px] font-black rounded-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none shadow-xl border border-gray-100 flex items-center gap-1.5 whitespace-nowrap z-[60]">
                {item.name}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-r border-b border-gray-100"></div>
              </div>

              {/* Active Indicator Dot (Optional) - Slightly smaller */}
              {isActive && (
                <div className="absolute -bottom-1.5 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_white]"></div>
              )}
            </Link>
          );
        })}
      </div>

    </div>
  );
};

export default BottomNav;
