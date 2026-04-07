"use client";

import React, { useState, useEffect } from "react";
import { Mail, MessageCircle, Send, ChevronLeft, Loader2 } from "lucide-react";
import { fetchOutreachMessages, PlatformType, OutreachMessage, formatTime, formatDate } from "@/services/outreach";

const ChatInterface = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('email');
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<OutreachMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      console.log(`[ChatInterface] Loading messages for platform: ${selectedPlatform}`);
      const data = await fetchOutreachMessages(selectedPlatform);
      console.log(`[ChatInterface] Received ${data.length} messages from service`);
      setMessages(data);
      setSelectedMessage(null);
      setLoading(false);
    };

    loadMessages();
  }, [selectedPlatform]);

  const platformConfig = {
    email: { icon: Mail, label: 'Email', color: 'blue' },
    whatsapp: { icon: MessageCircle, label: 'WhatsApp', color: 'green' },
    telegram: { icon: Send, label: 'Telegram', color: 'cyan' },
  };

  const getPlatformColors = (platform: PlatformType) => {
    switch (platform) {
      case 'email':
        return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' };
      case 'whatsapp':
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600' };
      case 'telegram':
        return { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', icon: 'text-cyan-600' };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: 'text-gray-600' };
    }
  };

  const colors = getPlatformColors(selectedPlatform);

  return (
    <div className="absolute inset-0 flex p-4 gap-4 overflow-hidden h-full bg-gradient-to-br from-gray-50 to-gray-100">
      {/* LIST VIEW */}
      {activeView === 'list' && (
        <div className="w-full lg:w-[380px] flex flex-col bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          {/* Platform Tabs */}
          <div className="p-4 border-b border-gray-100">
            <div className="grid grid-cols-3 gap-2">
              {(['email', 'whatsapp', 'telegram'] as PlatformType[]).map((platform) => {
                const config = platformConfig[platform];
                const Icon = config.icon;
                const isSelected = selectedPlatform === platform;
                const tabColors = getPlatformColors(platform);

                return (
                  <button
                    key={platform}
                    onClick={() => setSelectedPlatform(platform)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                      isSelected
                        ? `${tabColors.bg} ${tabColors.text} border ${tabColors.border} shadow-md`
                        : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={32} className={`${colors.icon} animate-spin`} />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-sm font-semibold mb-2">No messages yet</p>
                  <p className="text-xs">Send your first outreach via {platformConfig[selectedPlatform].label}</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => {
                      setSelectedMessage(msg);
                      setActiveView('detail');
                    }}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition-colors border-l-4 ${
                      msg.status === 'sent' ? `border-l-green-500 ${colors.bg}` : 'border-l-red-500 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">{msg.company}</h3>
                        <p className="text-xs text-gray-500">{msg.contactPerson}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        msg.status === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {msg.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-2">{msg.messagePreview}</p>
                    <span className="text-xs text-gray-400">
                      {formatDate(msg.timestamp)} at {formatTime(msg.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL VIEW */}
      {activeView === 'detail' && selectedMessage && (
        <div className="w-full flex flex-col bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          {/* Header */}
          <div className={`${colors.bg} border-b ${colors.border} p-4 flex items-center gap-3`}>
            <button
              onClick={() => setActiveView('list')}
              className={`p-2 hover:bg-white/50 rounded-lg transition-colors ${colors.icon}`}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className={`font-bold text-lg ${colors.text}`}>{selectedMessage.company}</h2>
              <p className="text-sm text-gray-600">{selectedMessage.contactPerson}</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              selectedMessage.status === 'sent'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {selectedMessage.status}
            </span>
          </div>

          {/* Message Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              {/* Subject (for email) */}
              {selectedMessage.messageSubject && (
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
                  <p className="font-bold text-gray-900">{selectedMessage.messageSubject}</p>
                </div>
              )}

              {/* Message Body */}
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Message</p>
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                  {selectedMessage.messageContent}
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Contact Email</p>
                    <p className="text-sm text-gray-700 font-medium break-all">{selectedMessage.contactEmail}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Sent Time</p>
                    <p className="text-sm text-gray-700 font-medium">
                      {formatDate(selectedMessage.timestamp)} at {formatTime(selectedMessage.timestamp)}
                    </p>
                  </div>
                </div>
                {selectedMessage.messageId && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Message ID</p>
                    <p className="text-xs text-gray-600 font-mono break-all">{selectedMessage.messageId}</p>
                  </div>
                )}
                {selectedMessage.errorMessage && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Error</p>
                    <p className="text-sm text-red-700">{selectedMessage.errorMessage}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
