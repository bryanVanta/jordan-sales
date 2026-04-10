"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Search, Filter, Play, Pause, Plus, FileUp, Edit3, Check, ChevronUp, ChevronDown, X, Mail, MessageCircle, Send, ChevronRight, Loader } from 'lucide-react';

const API_BASE_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`; // Fetching API base URL with /api endpoint from environment variables

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOutreachActive, setIsOutreachActive] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachResults, setOutreachResults] = useState<any>(null);
  const [outreachError, setOutreachError] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreLeads, setHasMoreLeads] = useState(false);
  const [progress, setProgress] = useState<any>({ status: 'idle' });
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState({
    company: '', person: '', email: '', phone: '', whatsapp: '', location: '', temp: 'Neutral', intent: '', next: 'Follow Up', channel: 'Email'
  });

  const startProgressTracking = () => {
    // Poll every 500ms during active search
    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress/current`);
        if (response.ok) {
          const progressData = await response.json();
          setProgress(progressData);
        }
      } catch (err) {
        // Silent fail, not critical
      }
    }, 500);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const loadLeads = useCallback(async (pageOffset = 0, append = false) => {
    if (!append) setLoading(true);
    setLoadingMore(append);
    setError('');
    
    // Start tracking progress
    startProgressTracking();

    try {
      const endpoint = pageOffset > 0 ? `${API_BASE_URL}/scraping/find-leads?offset=${pageOffset}` : `${API_BASE_URL}/leads`;
      const response = await fetch(endpoint, {
        method: pageOffset > 0 ? 'POST' : 'GET',
        headers: pageOffset > 0 ? { 'Content-Type': 'application/json' } : {},
        body: pageOffset > 0 ? JSON.stringify({ offset: pageOffset }) : undefined,
      });
      
      if (!response.ok) {
        throw new Error('Failed to load leads');
      }

      const result = await response.json();
      const newRows = (result.data?.leads || result.data || []).map((lead: any) => ({
        id: String(lead.id),
        company: lead.companyName || lead.company || 'Unknown Company',
        person: lead.person || '',
        email: lead.email || '',
        phone: lead.phone || '',
        whatsapp: lead.whatsapp || '',
        contactType: lead.contactType || '',
        location: lead.location || '',
        temp: lead.temp || lead.leadTemperature || 'Neutral',
        last: lead.status || 'new',
        intent: lead.intent || '',
        next: lead.next || lead.nextAction || 'Follow Up',
        channel: lead.channel || 'Email',
      }));
      
      setProjects(append ? (prevProjects) => [...prevProjects, ...newRows] : newRows);
      setOffset(pageOffset);
      setHasMoreLeads(newRows.length >= 10); // Show "Load More" if we got a full page (10 leads)
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load leads from the backend.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      stopProgressTracking();
      setProgress({ status: 'idle' });
    }
  }, []);

  const handleLoadMore = () => {
    loadLeads(offset + 10, true); // Load next 10 (append mode)
  };

  useEffect(() => {
    loadLeads();
    return () => stopProgressTracking(); // Cleanup on unmount
  }, [loadLeads]);

  const filteredProjects = useMemo(() => {
    let items = projects.filter(proj => 
      proj.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.person.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.location.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortConfig) {
      items.sort((a, b) => {
        const valA = (a as any)[sortConfig.key];
        const valB = (b as any)[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [projects, searchTerm, sortConfig]);

  const toggleProject = (id: string) => {
    setSelectedProjects(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleAdd = () => {
    setModalMode('add');
    setFormData({ company: '', person: '', email: '', phone: '', whatsapp: '', location: '', temp: 'Neutral', intent: '', next: 'Follow Up', channel: 'Email' });
    setIsModalOpen(true);
  };

  const handleEdit = () => {
    if (selectedProjects.length === 0) return;
    const project = projects.find(l => l.id === selectedProjects[0]);
    if (project) {
      setFormData({ 
        company: project.company, person: project.person, email: project.email, phone: project.phone, whatsapp: project.whatsapp, location: project.location,
        temp: project.temp, intent: project.intent, next: project.next, channel: project.channel 
      });
      setModalMode('edit');
      setIsModalOpen(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const saveLead = async () => {
      const payload = {
        company: formData.company,
        companyName: formData.company,
        person: formData.person,
        email: formData.email,
        location: formData.location,
        temp: formData.temp,
        leadTemperature: formData.temp,
        status: 'new',
        intent: formData.intent,
        next: formData.next,
        nextAction: formData.next,
        channel: formData.channel,
      };

      const endpoint = modalMode === 'add'
        ? `${API_BASE_URL}/leads`
        : `${API_BASE_URL}/leads/${selectedProjects[0]}`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';

      await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setIsModalOpen(false);
      await loadLeads();
    };

    saveLead().catch((submitError) => {
      console.error(submitError);
      setError('Could not save the lead.');
    });
  };

  const handleOutreach = async () => {
    if (selectedProjects.length === 0) {
      setOutreachError('Please select at least one lead to start outreach');
      setTimeout(() => setOutreachError(''), 3000);
      return;
    }

    setOutreachLoading(true);
    setOutreachError('');
    setOutreachResults(null);

    try {
      const response = await fetch(`${API_BASE_URL}/outreach/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedProjects,
          productInfoId: 'current',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send outreach');
      }

      const result = await response.json();
      setOutreachResults(result);
      setIsOutreachActive(false);
      setSelectedProjects([]); // Clear selection after outreach

      // Show success message
      setTimeout(() => {
        setOutreachResults(null);
      }, 5000);
    } catch (err) {
      console.error(err);
      setOutreachError(err instanceof Error ? err.message : 'Failed to send outreach messages');
    } finally {
      setOutreachLoading(false);
    }
  };

  const getTempStyle = (temp: string) => {
    switch(temp) {
      case 'Hot': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Warm': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'Cold': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Neutral': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const ChannelIcon = ({ channel }: { channel: string }) => {
    switch(channel) {
      case 'Whatsapp': return <MessageCircle size={14} className="text-emerald-500" />;
      case 'Email': return <Mail size={14} className="text-blue-500" />;
      case 'Telegram': return <Send size={14} className="text-sky-400 -rotate-45" />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full px-4 sm:px-10 relative overflow-hidden pb-40 lg:pb-32">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 z-10 gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1 w-full">
          <div className="relative w-full max-w-xs group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search projects..." 
              className="w-full bg-white border border-gray-100 rounded-xl py-2 pl-10 pr-4 text-[13px] font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400 shadow-sm"
            />
          </div>
          <button className="flex items-center justify-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl text-[13px] font-black text-gray-800 hover:bg-gray-50 transition-all">
            <Filter size={16} className="text-blue-500" /> Filter
          </button>
        </div>
      </div>

      {/* Progress Status Bar */}
      {progress.status !== 'idle' && (
        <div className={`mb-4 p-3 rounded-lg border flex items-center gap-3 z-10 ${
          progress.status === 'error' 
            ? 'bg-red-50 border-red-200' 
            : progress.status === 'complete'
            ? 'bg-green-50 border-green-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          {progress.status !== 'complete' && progress.status !== 'error' && (
            <Loader size={16} className={`${progress.status === 'searching' ? 'animate-spin text-blue-600' : 'animate-pulse text-amber-600'}`} />
          )}
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${
              progress.status === 'error' 
                ? 'text-red-700' 
                : progress.status === 'complete'
                ? 'text-green-700'
                : 'text-blue-700'
            }`}>
              {progress.status === 'searching' && '🔍 Searching for leads...'}
              {progress.status === 'enriching' && `📊 ${progress.message || 'Enriching leads...'}`}
              {progress.status === 'loading' && '📚 Loading previous data...'}
              {progress.status === 'complete' && `✅ Found ${progress.leadsFound || 0} leads`}
              {progress.status === 'error' && `❌ ${progress.message || 'Error during search'}`}
            </p>
            {progress.progress && progress.total && (
              <p className="text-[11px] text-gray-600 mt-1">
                Progress: {progress.progress} / {progress.total}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 bg-white/80 backdrop-blur-md rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[550px] z-10">
        {outreachError && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-bold text-sm">⚠️ Error:</span>
              <span className="text-red-600 text-sm">{outreachError}</span>
            </div>
            <button onClick={() => setOutreachError('')} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}
        {outreachResults && (
          <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-sm">✅ Success:</span>
              <span className="text-green-600 text-sm">{outreachResults.message}</span>
            </div>
            <button onClick={() => setOutreachResults(null)} className="text-green-400 hover:text-green-600"><X size={16} /></button>
          </div>
        )}
        <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto flex-1 relative custom-scrollbar">
          {loading ? (
            <div className="flex h-full items-center justify-center px-8 py-16 text-center text-sm font-bold text-gray-500">
              Loading leads from Firebase...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-8 py-16 text-center text-sm font-bold text-red-500">
              {error}
            </div>
          ) : (
          <table className="w-full text-left border-collapse min-w-[1520px]">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                <th className="py-3 pl-8 pr-4 w-12 text-center sticky left-0 z-30 bg-white shadow-[2px_0_0_rgba(0,0,0,0.05)]"></th>
                <th className="py-3 px-4 group cursor-pointer sticky left-12 z-30 bg-white shadow-[2px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('company')}>
                  <div className="flex items-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap group-hover:text-blue-600">Company Name <ChevronDown size={10} className="ml-1 opacity-20" /></div>
                </th>
                {['Person in Charge', 'Contact', 'Email', 'Location', 'Temperature', 'Status', 'Intent', 'Next Action', 'Channel'].map((label, idx) => (
                  <th key={label} className="py-3 px-4 group cursor-pointer" onClick={() => handleSort(['person', 'phone', 'email', 'location', 'temp', 'last', 'intent', 'next', 'channel'][idx])}>
                    <div className="flex items-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap group-hover:text-blue-600">{label} <ChevronDown size={10} className="ml-1 opacity-20" /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProjects.map((proj) => (
                <tr key={proj.id} className="group hover:bg-blue-50/10 transition-colors">
                  <td className="py-2.5 pl-8 pr-4 sticky left-0 z-10 bg-white group-hover:bg-[#f8faff] transition-colors border-r border-gray-50">
                    <div onClick={() => toggleProject(proj.id)} className={`w-4 h-4 border-2 rounded mx-auto cursor-pointer flex items-center justify-center transition-all ${selectedProjects.includes(proj.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-200'}`}>
                      {selectedProjects.includes(proj.id) && <Check size={10} className="text-white font-bold" />}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap sticky left-12 z-10 bg-white group-hover:bg-[#f8faff] transition-colors shadow-[2px_0_0_rgba(0,0,0,0.05)]"><span className="text-[13px] font-black text-gray-800">{proj.company}</span></td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-bold text-[13px] text-gray-600">{proj.person}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px]">
                    {proj.whatsapp ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">WhatsApp</span>
                        <div className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 cursor-pointer">
                          <MessageCircle size={14} className="text-emerald-500" />
                          <span className="font-mono text-[11px]">{proj.whatsapp}</span>
                        </div>
                      </div>
                    ) : proj.phone ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Phone</span>
                        <div className="flex items-center gap-1 text-amber-600">
                          <span className="text-[12px]">📱</span>
                          <span className="font-mono text-[11px]">{proj.phone}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-[11px]">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px] text-blue-500/80">{proj.email || '-'}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px] text-gray-500">{proj.location}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 w-fit ${getTempStyle(proj.temp)}`}>{proj.temp}</div></td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><span className="text-[10px] font-bold text-gray-400 italic">{proj.last}</span></td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px] text-gray-500 max-w-[200px] truncate">{proj.intent}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className="px-2 py-1 bg-gray-900 text-white rounded-[10px] text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer hover:bg-blue-600 transition-all w-fit shadow-sm">{proj.next} <ChevronRight size={10} /></div></td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className="px-2 py-1 bg-white border border-gray-100 rounded-[10px] text-[9px] font-black uppercase tracking-wide flex items-center gap-1.5 w-fit"><ChannelIcon channel={proj.channel} /> {proj.channel}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      <div className="fixed bottom-24 lg:bottom-[60px] left-0 right-0 px-4 sm:px-10 lg:px-20 pointer-events-none z-50">
        <div className="flex flex-col lg:flex-row items-center justify-between w-full max-w-[1600px] mx-auto pointer-events-auto gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={handleAdd} className="flex items-center gap-2 bg-gray-900 border border-white/10 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-[18px] text-[11px] sm:text-[12px] font-bold shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1">
              <div className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center"><Plus size={14} strokeWidth={3} /></div> Add Projects
            </button>
            <button className="flex items-center gap-2 bg-white border border-gray-100 px-4 sm:px-6 py-2.5 sm:py-3 rounded-[18px] text-[11px] sm:text-[12px] font-black text-gray-800 shadow-xl hover:bg-gray-50 transition-all transform hover:-translate-y-1">
              <FileUp size={16} className="text-blue-500" /> Import
            </button>
            <button disabled={selectedProjects.length === 0} onClick={handleEdit} className={`flex items-center gap-2 bg-white border border-gray-100 px-4 sm:px-6 py-2.5 sm:py-3 rounded-[18px] text-[11px] sm:text-[12px] font-black text-gray-800 shadow-xl hover:bg-gray-50 transition-all transform hover:-translate-y-1 ${selectedProjects.length === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
              <Edit3 size={16} className="text-purple-500" /> Edit List
            </button>
            {hasMoreLeads && (
              <button onClick={handleLoadMore} disabled={loadingMore} className="flex items-center gap-2 bg-green-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-[18px] text-[11px] sm:text-[12px] font-bold shadow-xl hover:bg-green-700 transition-all transform hover:-translate-y-1 disabled:opacity-50">
                <ChevronDown size={14} /> {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center px-4 py-2.5 rounded-[18px] bg-white border border-gray-100 shadow-xl text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Auto: WhatsApp &gt; Email
            </div>
            <button 
              onClick={handleOutreach}
              disabled={outreachLoading || selectedProjects.length === 0}
              className={`${
                selectedProjects.length === 0 
                  ? 'bg-gray-400 opacity-50 cursor-not-allowed' 
                  : 'bg-blue-600 hover:-translate-y-1'
              } text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-[24px] font-black text-[11px] sm:text-[12px] tracking-widest flex items-center gap-2 sm:gap-3 shadow-lg transition-all`}
            >
              {outreachLoading ? (
                <>
                  <Loader size={16} className="animate-spin" /> SENDING...
                </>
              ) : (
                <>
                  <Send size={16} /> SEND OUTREACH TO {selectedProjects.length > 0 ? selectedProjects.length : 0}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-[32px] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6 text-left">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">{modalMode === 'add' ? 'New Project' : 'Edit Project'}</h2>
                  <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest mt-1">Global Project Hub</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl text-gray-400 hover:text-gray-900 transition-all"><X size={20} /></button>
             </div>
             <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Company</label>
                    <input required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                   </div>
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Person</label>
                    <input required value={formData.person} onChange={e => setFormData({...formData, person: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                   </div>
                </div>
                <div className="space-y-1.5 flex flex-col items-start text-left">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Business Email</label>
                  <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="+60123456789" />
                   </div>
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
                    <input type="tel" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" placeholder="+60123456789" />
                   </div>
                </div>
                <div className="space-y-1.5 flex flex-col items-start text-left">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Location</label>
                  <input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Temperature</label>
                    <select value={formData.temp} onChange={e => setFormData({...formData, temp: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none">{['Hot', 'Warm', 'Cold', 'Neutral'].map(v => <option key={v} value={v}>{v}</option>)}</select>
                   </div>
                   <div className="space-y-1.5 flex flex-col items-start text-left">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Channel</label>
                    <select value={formData.channel} onChange={e => setFormData({...formData, channel: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none">{['Email', 'Whatsapp', 'Telegram'].map(v => <option key={v} value={v}>{v}</option>)}</select>
                   </div>
                </div>
                <div className="space-y-1.5 flex flex-col items-start text-left">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Next Action</label>
                  <select value={formData.next} onChange={e => setFormData({...formData, next: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none">{['Follow Up', 'Send Promo', 'Close Deal', 'Escalate'].map(v => <option key={v} value={v}>{v}</option>)}</select>
                </div>
                <div className="space-y-1.5 flex flex-col items-start text-left">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Intent / Context</label>
                  <textarea value={formData.intent} onChange={e => setFormData({...formData, intent: e.target.value})} className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm font-bold h-20 resize-none outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-black tracking-widest text-[12px] hover:bg-blue-700 shadow-lg mt-4 transition-all uppercase">{modalMode === 'add' ? 'Confirm Addition' : 'Update Project'}</button>
             </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 2px solid white; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}
