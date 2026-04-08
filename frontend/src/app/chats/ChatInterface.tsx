"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  CheckCheck,
  Loader2,
  Heart,
  Wind
} from "lucide-react";
import { fetchCompleteConversationByLeadId, formatTime } from "@/services/outreach";
import { db } from "@/lib/firebase";
import { addDoc, collection, getDocs } from "firebase/firestore";

const API_BASE_URL = `/api`; // Use Next.js API routes (works on Vercel)

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
  timestampMs?: number; // For sentiment + accurate ordering
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
  firebaseLeadId?: string; // Added to track Firebase document ID for inbound/follow-up emails
  name: string;
  email: string;
  company: string;
  time: string;
  messages: Message[];
  media: { label: string, count: string }[];
  progress: string[];
  temperature: number; // 0 to 100
  sentiment?: 'hot' | 'warm' | 'neutral' | 'cold'; // Sentiment based on response patterns
  lastOutreachTime?: Date; // Track when we last sent a message
  lastResponseTime?: Date; // Track when customer last responded
  channel?: 'email' | 'whatsapp' | 'telegram'; // Channel/platform for this conversation
}

const CUSTOMERS: CustomerData[] = [
  { 
    id: 1, 
    name: "Booking Team", 
    email: "zeroyuki.pradibta@gmail.com",
    company: "St Giles Wembley Penang",
    time: "10:32 AM", 
    messages: [],
    media: [],
    progress: [],
    temperature: 65,
  },
];

const DEFAULT_MEDIA: MediaItem[] = [
  { label: 'Documents', count: '0 files, 0mb', icon: <FileText size={16} />, border: 'border-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
  { label: 'Photos', count: '0 files, 0mb', icon: <ImageIcon size={16} />, border: 'border-orange-100', bg: 'bg-orange-50', text: 'text-orange-600' },
  { label: 'Other', count: '0 files, 0mb', icon: <Info size={16} />, border: 'border-cyan-100', bg: 'bg-cyan-50', text: 'text-cyan-600' }
];

/**
 * DEPRECATED: Sentiment analysis is now handled by AI on the backend
 * This function is kept only as a fallback for initial display before backend analysis runs
 * Real sentiment classification is done via LLM on the backend using analyzeSentimentWithAI()
 * and runs on: (1) inbound email trigger, (2) daily batch at 8am Malay time
 */
const calculateSentiment = (messages: Message[]): 'hot' | 'warm' | 'neutral' | 'cold' => {
  if (!messages || messages.length === 0) return 'neutral';

  const inboundMessages = messages.filter(m => m.sender === 'user');
  const outboundMessages = messages.filter(m => m.sender === 'bot');
  const nowMs = Date.now();

  // No inbound replies: never "warm". Neutral initially, then cold after 24h.
  if (inboundMessages.length === 0) {
    const lastOutbound = outboundMessages.length > 0 ? outboundMessages[outboundMessages.length - 1] : undefined;
    const lastOutboundMs = lastOutbound?.timestampMs;
    if (!lastOutboundMs || !Number.isFinite(lastOutboundMs)) return 'neutral';

    const hoursSinceLastOutbound = (nowMs - lastOutboundMs) / (1000 * 60 * 60);
    return hoursSinceLastOutbound >= 24 ? 'cold' : 'neutral';
  }

  // Most recent inbound reply and the outbound before it
  const lastInbound = inboundMessages[inboundMessages.length - 1];
  const lastInboundIdx = messages.lastIndexOf(lastInbound);
  let lastBotBeforeInbound: Message | undefined = undefined;
  for (let i = lastInboundIdx - 1; i >= 0; i--) {
    if (messages[i].sender === 'bot') {
      lastBotBeforeInbound = messages[i];
      break;
    }
  }

  // Calculate response time in minutes (prefer timestamps; fallback to message count heuristic)
  let responseTimeMinutes = 9999;
  if (
    lastBotBeforeInbound?.timestampMs &&
    lastInbound.timestampMs &&
    Number.isFinite(lastBotBeforeInbound.timestampMs) &&
    Number.isFinite(lastInbound.timestampMs)
  ) {
    responseTimeMinutes = Math.max(
      0,
      (lastInbound.timestampMs - lastBotBeforeInbound.timestampMs) / (1000 * 60)
    );
  } else if (lastBotBeforeInbound) {
    responseTimeMinutes = (lastInboundIdx - messages.indexOf(lastBotBeforeInbound)) * 15;
  }

  const inboundCount = inboundMessages.length;

  if (inboundCount >= 2 && responseTimeMinutes <= 60) return 'hot';
  if (inboundCount >= 1 && responseTimeMinutes <= 24 * 60) return 'warm';
  return 'neutral';
};

const getSentimentCountsFromCustomers = (customers: CustomerData[]) => {
  return customers.reduce(
    (acc, c) => {
      const key = c.sentiment || 'neutral';
      if (key === 'hot' || key === 'warm' || key === 'neutral' || key === 'cold') acc[key]++;
      return acc;
    },
    { hot: 0, warm: 0, neutral: 0, cold: 0 }
  );
};

/**
 * Get sentiment icon and color
 */
const getSentimentStyle = (sentiment?: string) => {
  switch (sentiment) {
    case 'hot':
      return { icon: Flame, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' };
    case 'warm':
      return { icon: Sun, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' };
    case 'cold':
      return { icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' };
    default:
      return { icon: Cloud, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' };
  }
};

const sentimentToTemperature = (sentiment?: 'hot' | 'warm' | 'neutral' | 'cold') => {
  switch (sentiment) {
    case 'cold':
      return 15;
    case 'neutral':
      return 45;
    case 'warm':
      return 70;
    case 'hot':
      return 90;
    default:
      return 45;
  }
};

const ChatInterface = () => {
  const searchParams = useSearchParams();
  const platformFromUrl = (searchParams?.get('platform') || 'email') as 'email' | 'whatsapp' | 'telegram';
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [showContactInfo, setShowContactInfo] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [allCustomers, setAllCustomers] = useState<CustomerData[]>(CUSTOMERS);
  const [activeView, setActiveView] = useState<'list' | 'chat' | 'info'>('list');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadedCustomerIds, setLoadedCustomerIds] = useState<Set<number>>(new Set());
  const [sentimentCounts, setSentimentCounts] = useState({ hot: 0, warm: 0, neutral: 0, cold: 0 });
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp' | 'telegram'>(platformFromUrl);
  
  const currentCustomer = allCustomers.find(c => c.id === selectedCustomerId) || allCustomers[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Sync with URL platform parameter from Navbar
  useEffect(() => {
    setSelectedChannel(platformFromUrl);
    console.log(`[Chat] Platform changed from Navbar: ${platformFromUrl}`);
  }, [platformFromUrl]);

  // Keep the distribution cards in-sync with what the chat list is showing.
  useEffect(() => {
    setSentimentCounts(getSentimentCountsFromCustomers(allCustomers));
  }, [allCustomers, selectedChannel]);

  // Load all leads from Firebase when component mounts or channel changes
  useEffect(() => {
    const loadAllLeads = async () => {
      try {
        console.log(`[Chat] Loading all leads from Firebase for channel: ${selectedChannel}...`);
        
        // Get all leads from outreach_history
        const outreachRef = collection(db, 'outreach_history');
        const outreachSnapshot = await getDocs(outreachRef);
        
        const leadsMap = new Map<string, any>();
        
        // Group messages by contactEmail to find leads with messages (filtered by channel)
          outreachSnapshot.docs.forEach((doc) => {
            const data: any = doc.data();
            const channel = (data.channel || 'email') as string;
            const contact =
              selectedChannel === 'whatsapp'
                ? data.contactWhatsApp || data.contactPhone || data.contactEmail || ''
                : data.contactEmail || '';

            // Only include messages from the selected channel
            if (contact && channel === selectedChannel && !leadsMap.has(contact)) {
              console.log(`[Chat] Found outreach message for contact: ${contact}, leadId: ${data.leadId}, channel: ${channel}`);
              leadsMap.set(contact, {
                email: contact, // displayed identifier (email or whatsapp)
                contactEmail: contact,
                company: data.company,
                contactPerson: data.contactPerson,
                firebaseLeadId: data.leadId, // Store the actual Firebase leadId
                channel: channel,
              });
            }
          });
        
          // Also check inbound messages (channel-specific)
          if (selectedChannel === 'email') {
            const inboundRef = collection(db, 'inbound_emails');
            const inboundSnapshot = await getDocs(inboundRef);

            inboundSnapshot.docs.forEach((doc) => {
              const data: any = doc.data();
              const contact = data.contactEmail || '';
              const channel = data.channel || 'email';

              if (contact && channel === selectedChannel && !leadsMap.has(contact)) {
                console.log(`[Chat] Found inbound email for: ${contact}, leadId: ${data.leadId}, channel: ${channel}`);
                leadsMap.set(contact, {
                  email: contact,
                  contactEmail: contact,
                  company: data.company,
                  contactPerson: data.contactPerson,
                  firebaseLeadId: data.leadId,
                  channel: channel,
                });
              }
            });
          }

          if (selectedChannel === 'whatsapp') {
            const inboundRef = collection(db, 'inbound_whatsapp');
            const inboundSnapshot = await getDocs(inboundRef);

            inboundSnapshot.docs.forEach((doc) => {
              const data: any = doc.data();
              const contact = data.contactWhatsApp || '';
              const channel = data.channel || 'whatsapp';

              if (contact && channel === selectedChannel && !leadsMap.has(contact)) {
                console.log(`[Chat] Found inbound WhatsApp for: ${contact}, leadId: ${data.leadId}, channel: ${channel}`);
                leadsMap.set(contact, {
                  email: contact,
                  contactEmail: contact,
                  company: data.company,
                  contactPerson: data.contactPerson,
                  firebaseLeadId: data.leadId,
                  channel: channel,
                });
              }
            });
          }
        
        // Load messages for each lead and create preview
        const leadsWithMessages = await Promise.all(
          Array.from(leadsMap.values()).map(async (lead, index) => {
            try {
              // Fetch complete conversation for this lead
        const conversationMessages = await fetchCompleteConversationByLeadId(lead.firebaseLeadId, selectedChannel);
              
              // Convert to Message format - keep timestamp for sorting
              const messagesWithTimestamp = conversationMessages
                .map((msg: any) => {
                  const timestamp = msg.createdAt || msg.timestamp;
                  return {
                    id: msg.messageId || msg.id,
                    sender: (msg.status === 'received' ? 'user' : 'bot') as 'user' | 'bot',
                    text: selectedChannel === 'whatsapp'
                      ? `${msg.messageContent}`
                      : `[${msg.messageSubject || 'Email'}]\n\n${msg.messageContent}`,
                    time: msg.createdAt?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' })
                      ? msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : formatTime(msg.timestamp) || 'Unknown time',
                    sortTime: timestamp instanceof Date ? timestamp.getTime() : 0,
                  };
                });
              
              // Sort by timestamp ascending (oldest first)
              const messagesList: Message[] = messagesWithTimestamp
                .sort((a, b) => a.sortTime - b.sortTime)
                .map(({ sortTime, ...msg }) => ({ ...msg, timestampMs: sortTime }) as Message);
              
              // Get most recent message time for display
              const mostRecentTime = messagesList.length > 0 ? messagesList[messagesList.length - 1].time : 'Just now';
              
              // Calculate sentiment
              const sentiment: 'hot' | 'warm' | 'neutral' | 'cold' = calculateSentiment(messagesList);
              
              console.log(`[Chat] Creating lead entry for ${lead.contactEmail} with ${messagesList.length} messages, sentiment: ${sentiment}`);
              return {
                 id: index + 1,
                 firebaseLeadId: lead.firebaseLeadId, // Store the actual Firebase ID
                 name: lead.contactPerson || 'Unknown',
                 email: lead.contactEmail,
                 company: lead.company || 'Unknown Company',
                 time: mostRecentTime,
                 messages: messagesList,
                 media: [],
                 progress: [],
                 temperature: sentimentToTemperature(sentiment),
                 sentiment: sentiment, // Add calculated sentiment
                 channel: lead.channel, // Store the channel
               };
            } catch (error) {
              console.error(`[Chat] Error loading messages for ${lead.contactEmail}:`, error);
               return {
                 id: index + 1,
                 firebaseLeadId: lead.firebaseLeadId,
                 name: lead.contactPerson || 'Unknown',
                 email: lead.contactEmail,
                 company: lead.company || 'Unknown Company',
                 time: 'Just now',
                 messages: [],
                 media: [],
                 progress: [],
                 temperature: sentimentToTemperature('neutral'),
                 sentiment: 'neutral' as const, // Default to neutral on error
                 channel: lead.channel,
               };
            }
          })
        );
        
        console.log(`[Chat] Loaded ${leadsWithMessages.length} leads with messages`, leadsWithMessages);
        if (leadsWithMessages.length > 0) {
          setAllCustomers(leadsWithMessages);
          setSelectedCustomerId(leadsWithMessages[0].id);
          // Mark all as loaded since we just loaded messages
          const loadedIds = new Set(leadsWithMessages.map(l => l.id));
          setLoadedCustomerIds(loadedIds);
        } else {
          // Clear customers if no conversations found for this channel
          console.log(`[Chat] No conversations found for channel: ${selectedChannel}`);
          setAllCustomers([]);
          setLoadedCustomerIds(new Set());
        }
      } catch (error) {
        console.error('[Chat] Error loading leads:', error);
      }
    };

    loadAllLeads();
    setLoadedCustomerIds(new Set()); // Clear loaded customer IDs when channel changes
    setSelectedCustomerId(1); // Reset selected customer
  }, [selectedChannel]);

  // Load outreach messages from Firebase when customer is selected
  useEffect(() => {
    const loadOutreachMessages = async () => {
      // Skip if already loaded for this customer to prevent duplicates
      if (loadedCustomerIds.has(selectedCustomerId)) {
        console.log(`[Chat] Already loaded messages for customer ${selectedCustomerId}, skipping...`);
        return;
      }

      console.log(`[Chat] Loading complete conversation for lead: ${currentCustomer.firebaseLeadId}`);
      setLoadingMessages(true);
      
      try {
        if (!currentCustomer.firebaseLeadId) {
          throw new Error('Missing lead id for conversation fetch');
        }

        // Fetch using lead id - gets both sent (outreach) and received (inbound) messages
        const conversationMessages = await fetchCompleteConversationByLeadId(currentCustomer.firebaseLeadId, selectedChannel);
        
        if (conversationMessages && conversationMessages.length > 0) {
          // Convert messages to chat Message format
          const convertedMessages: Message[] = conversationMessages.map((msg: any) => ({
            id: msg.messageId || msg.id,
            sender: msg.status === 'received' ? "user" : "bot" as const,
            text: selectedChannel === 'whatsapp'
              ? `${msg.messageContent}`
              : `[${msg.messageSubject || 'Email'}]\n\n${msg.messageContent}`,
            time: msg.createdAt?.toDate?.() 
              ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : formatTime(msg.timestamp) || 'Unknown time',
            timestampMs: msg.timestamp instanceof Date ? msg.timestamp.getTime() : undefined,
          }));

          // Set only conversation messages (replace instead of append to prevent duplicates)
          setAllCustomers(prev => prev.map(c => 
            c.id === selectedCustomerId
              ? { ...c, messages: convertedMessages }
              : c
          ));
          
          // Mark this customer as loaded
          setLoadedCustomerIds(prev => new Set(prev).add(selectedCustomerId));
          console.log(`[Chat] Loaded ${convertedMessages.length} total conversation messages from Firestore`);
        } else {
          console.log(`[Chat] No conversation messages found for ${currentCustomer.email}`);
          // Mark as loaded even with no messages
          setLoadedCustomerIds(prev => new Set(prev).add(selectedCustomerId));
        }
      } catch (error) {
        console.error(`[Chat] Error loading conversation messages:`, error);
      } finally {
        setLoadingMessages(false);
      }
    };

    if (currentCustomer?.email) {
      loadOutreachMessages();
    }
  }, [selectedCustomerId, currentCustomer?.email, loadedCustomerIds]);

  useEffect(() => {
    setShowPlusMenu(false);
  }, [selectedCustomerId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (currentCustomer?.messages) {
      scrollToBottom();
    }
  }, [currentCustomer?.messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const messageText = inputValue;
    
    // Optimistically add the message to the UI
    setAllCustomers(prev => prev.map(c => 
      c.id === selectedCustomerId 
        ? { ...c, messages: [...c.messages, { id: Date.now().toString(), sender: "bot", text: messageText, time }] } 
        : c
    ));
    setInputValue("");
    
    const isWhatsApp = selectedChannel === 'whatsapp';
    const endpoint = isWhatsApp ? `${API_BASE_URL}/whatsapp/send` : `${API_BASE_URL}/follow-up/send`;

    // Send message via Next.js API routes
    try {
      setSendingMessage(true);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isWhatsApp
            ? {
                leadId: (currentCustomer.firebaseLeadId || currentCustomer.id).toString(),
                company: currentCustomer.company,
                message: messageText,
                whatsapp: currentCustomer.email, // for WhatsApp view, this holds the E.164 contact
              }
            : {
                leadId: currentCustomer.firebaseLeadId || currentCustomer.id, // Use Firebase leadId
                company: currentCustomer.company,
                message: messageText,
                email: currentCustomer.email,
              }
        ),
      });
      
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        console.error('Failed to send message', details);
        // Remove the message if sending failed
        setAllCustomers(prev => prev.map(c =>
          c.id === selectedCustomerId
            ? { ...c, messages: c.messages.slice(0, -1) }
            : c
        ));
      } else {
        const result = await response.json().catch(() => ({} as any));
        console.log('Message sent successfully', result);

        if (!isWhatsApp) {
          // Best-effort: persist outbound email for conversation history (Resend route doesn't write to Firestore)
          try {
            const subject = `Follow-up: ${currentCustomer.company}`;
            const docData: any = {
              leadId: (currentCustomer.firebaseLeadId || currentCustomer.id).toString(),
              company: currentCustomer.company,
              contactPerson: currentCustomer.name || 'Contact',
              contactEmail: currentCustomer.email,
              channel: 'email',
              messageSubject: subject,
              messageContent: messageText,
              messagePreview: messageText.substring(0, 200),
              status: 'sent',
              type: 'follow-up',
              timestamp: new Date(),
              createdAt: new Date(),
              source: 'resend',
            };

            if (result?.messageId) docData.messageId = result.messageId;
            await addDoc(collection(db, 'outreach_history'), docData);
          } catch (persistError) {
            console.warn('[Chat] Sent email but failed to persist outreach_history:', persistError);
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the message if sending failed
      setAllCustomers(prev => prev.map(c =>
        c.id === selectedCustomerId
          ? { ...c, messages: c.messages.slice(0, -1) }
          : c
      ));
    } finally {
      setSendingMessage(false);
    }
  };

  const getMediaData = () => {
    if (!currentCustomer?.media) return DEFAULT_MEDIA;
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
            <StatusCard label="Hot" count={sentimentCounts.hot.toString()} trend="+0" bg="bg-[#FFF0EB]" text="text-orange-600" border="border-orange-100" icon={Flame} />
            <StatusCard label="Cold" count={sentimentCounts.cold.toString()} trend="+0" bg="bg-[#EBF4FF]" text="text-blue-600" border="border-blue-100" icon={Snowflake} />
            <StatusCard label="Warm" count={sentimentCounts.warm.toString()} trend="+0" bg="bg-[#FFFDF0]" text="text-yellow-600" border="border-yellow-100" icon={Sun} />
            <StatusCard label="Neutral" count={sentimentCounts.neutral.toString()} trend="+0" bg="bg-gray-50" text="text-gray-600" border="border-gray-200" icon={Cloud} />
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
            {allCustomers.length > 0 ? (
              allCustomers.map((customer) => {
                const lastMsg = customer.messages.length > 0 ? customer.messages[customer.messages.length - 1].text.substring(0, 50) : "No messages";
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
                  {/* Profile Circle with Sentiment Icon (no background) */}
                  <div className="relative">
                    {/* Sentiment Icon in front of profile circle, filled and bottom right */}
                    {(() => {
                      const { icon: SentimentIcon, color } = getSentimentStyle(customer.sentiment);
                      return (
                        <SentimentIcon size={24} className={`absolute right-0 bottom-0 z-20 ${color} fill-current`} style={{ background: 'none', transform: 'translate(25%, 25%)' }} />
                      );
                    })()}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 relative z-10 ${
                      selectedCustomerId === customer.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                    }`}>
                      {customer.company.substring(0, 1)}
                    </div>
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-[13px] font-black tracking-tight truncate relative z-10 ${selectedCustomerId === customer.id ? "text-blue-900" : "text-gray-900"}`}>
                      {customer.company}
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
            })
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                <Cloud size={48} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium text-sm">No conversations yet</p>
                <p className="text-gray-400 text-xs mt-1">Conversations will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= MIDDLE COLUMN: Chat Area ================= */}
      <div className={`flex-1 lg:flex flex-col bg-white/90 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white shadow-xl h-full overflow-hidden relative animate-in zoom-in-95 duration-500 ${activeView === 'chat' ? 'flex' : 'hidden'}`}>
        
        {currentCustomer ? (
          <>
        {/* Mobile Header (back button) */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-50 bg-white/50">
          <button onClick={() => setActiveView('list')} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-600 transition-all active:scale-95">
             <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex flex-col items-center">
             <span className="text-[13px] font-black text-gray-900 leading-tight">{currentCustomer.company}</span>
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
              <button className="p-2 text-gray-300 hover:text-gray-600 transition-colors" disabled={sendingMessage}><Mic size={18} /></button>
              <button 
                onClick={() => handleSendMessage()}
                disabled={sendingMessage || !inputValue.trim()}
                className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {sendingMessage ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Cloud size={56} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-bold">Select a conversation to start</p>
              <p className="text-gray-400 text-sm mt-1">Choose from the list on the left</p>
            </div>
          </div>
        )}
      </div>

      {/* ================= RIGHT COLUMN: Contact Info ================= */}
      {(showContactInfo || activeView === 'info') && currentCustomer && (
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
                <div className="relative mb-3">
                  <div className="w-24 h-24 bg-gray-100 rounded-full shadow-lg flex items-center justify-center font-black text-3xl text-gray-300">
                    {currentCustomer.company.substring(0, 1)}
                  </div>
                  {/* Sentiment Icon in front of profile circle, filled and bottom right */}
                  {(() => {
                    const { icon: SentimentIcon, color } = getSentimentStyle(currentCustomer.sentiment);
                    return (
                      <SentimentIcon size={28} className={`absolute right-2 bottom-2 z-20 ${color} fill-current`} style={{ background: 'none', transform: 'translate(35%, 35%)' }} />
                    );
                  })()}
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">{currentCustomer.company}</h3>
                {/* Show Sentiment Text */}
                <p className={`text-xs font-bold mt-1 px-3 py-1 rounded-full inline-block ${
                  currentCustomer.sentiment === 'hot' ? 'bg-red-50 text-red-600' :
                  currentCustomer.sentiment === 'warm' ? 'bg-orange-50 text-orange-600' :
                  currentCustomer.sentiment === 'cold' ? 'bg-blue-50 text-blue-600' :
                  'bg-gray-50 text-gray-600'
                }`}>
                  {currentCustomer.sentiment ? currentCustomer.sentiment.charAt(0).toUpperCase() + currentCustomer.sentiment.slice(1) : 'Neutral'}
                </p>
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
