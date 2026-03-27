"use client";
import React, { useState, useMemo, useRef } from 'react';
import { Search, Filter, Play, Pause, Plus, FileUp, Edit3, Check, ChevronUp, ChevronDown, X, Mail, MessageCircle, Send, ChevronRight } from 'lucide-react';

const INITIAL_PROJECTS = [
  { id: 1, company: 'Starlight Media', person: 'Sarah Connor', email: 'sarah.c@starlight.com', temp: 'Hot', last: '2h ago', intent: 'Looking for scaling', next: 'Send Promo', channel: 'Whatsapp' },
  { id: 2, company: 'Nova Tech', person: 'John Wick', email: 'j.wick@continental.com', temp: 'Warm', last: '1d ago', intent: 'Interested in automation', next: 'Follow Up', channel: 'Email' },
  { id: 3, company: 'Echo Systems', person: 'Ellen Ripley', email: 'ripley@weyland.com', temp: 'Cold', last: '5d ago', intent: 'Not interested currently', next: 'Escalate', channel: 'Telegram' },
  { id: 4, company: 'Glitch Ltd.', person: 'Neo Anderson', email: 'neo@matrix.net', temp: 'Neutral', last: '3h ago', intent: 'Wants to understand pricing', next: 'Close Deal', channel: 'Whatsapp' },
  { id: 5, company: 'Cyberdyne', person: 'Miles Dyson', email: 'miles.d@cyberdyne.com', temp: 'Hot', last: '30m ago', intent: 'Security infrastructure', next: 'Send Promo', channel: 'Email' },
  { id: 6, company: 'Tyrell Corp', person: 'Eldon Tyrell', email: 'tyrell@replica.co', temp: 'Cold', last: '12h ago', intent: 'Legacy data migration', next: 'Escalate', channel: 'Whatsapp' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOutreachActive, setIsOutreachActive] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState({
    company: '', person: '', email: '', temp: 'Neutral', intent: '', next: 'Follow Up', channel: 'Email'
  });

  const filteredProjects = useMemo(() => {
    let items = projects.filter(proj => 
      proj.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.person.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.email.toLowerCase().includes(searchTerm.toLowerCase())
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

  const toggleProject = (id: number) => {
    setSelectedProjects(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleAdd = () => {
    setModalMode('add');
    setFormData({ company: '', person: '', email: '', temp: 'Neutral', intent: '', next: 'Follow Up', channel: 'Email' });
    setIsModalOpen(true);
  };

  const handleEdit = () => {
    if (selectedProjects.length === 0) return;
    const project = projects.find(l => l.id === selectedProjects[0]);
    if (project) {
      setFormData({ 
        company: project.company, person: project.person, email: project.email, 
        temp: project.temp, intent: project.intent, next: project.next, channel: project.channel 
      });
      setModalMode('edit');
      setIsModalOpen(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'add') {
      const newProject = { ...formData, id: Date.now(), last: 'Just now' };
      setProjects([newProject, ...projects]);
    } else {
      setProjects(projects.map(l => l.id === selectedProjects[0] ? { ...l, ...formData } : l));
    }
    setIsModalOpen(false);
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
    <div className="flex flex-col h-full px-10 relative overflow-hidden pb-32">
      <div className="flex items-center justify-between mb-6 z-10">
        <div className="flex items-center gap-4 flex-1">
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
          <button className="flex items-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl text-[13px] font-black text-gray-800 hover:bg-gray-50 transition-all">
            <Filter size={16} className="text-blue-500" /> Filter
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white/80 backdrop-blur-md rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[550px] z-10">
        <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto flex-1 relative custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                <th className="py-3 pl-8 pr-4 w-12 text-center sticky left-0 z-30 bg-white shadow-[2px_0_0_rgba(0,0,0,0.05)]"></th>
                <th className="py-3 px-4 group cursor-pointer sticky left-12 z-30 bg-white shadow-[2px_0_0_rgba(0,0,0,0.05)]" onClick={() => handleSort('company')}>
                  <div className="flex items-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap group-hover:text-blue-600">Company Name <ChevronDown size={10} className="ml-1 opacity-20" /></div>
                </th>
                {['Person in Charge', 'Email', 'Temperature', 'Status', 'Intent', 'Next Action', 'Channel'].map((label, idx) => (
                  <th key={label} className="py-3 px-4 group cursor-pointer" onClick={() => handleSort(['person', 'email', 'temp', 'last', 'intent', 'next', 'channel'][idx])}>
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
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px] text-blue-500/80">{proj.email}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 w-fit ${getTempStyle(proj.temp)}`}>{proj.temp}</div></td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><span className="text-[10px] font-bold text-gray-400 italic">{proj.last}</span></td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[12px] text-gray-500 max-w-[200px] truncate">{proj.intent}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className="px-2 py-1 bg-gray-900 text-white rounded-[10px] text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer hover:bg-blue-600 transition-all w-fit shadow-sm">{proj.next} <ChevronRight size={10} /></div></td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><div className="px-2 py-1 bg-white border border-gray-100 rounded-[10px] text-[9px] font-black uppercase tracking-wide flex items-center gap-1.5 w-fit"><ChannelIcon channel={proj.channel} /> {proj.channel}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fixed bottom-[60px] left-0 right-0 px-20 pointer-events-none z-50">
        <div className="flex items-center justify-between w-full max-w-[1600px] mx-auto pointer-events-auto">
          <div className="flex items-center gap-2">
            <button onClick={handleAdd} className="flex items-center gap-2 bg-gray-900 border border-white/10 text-white px-6 py-3 rounded-[18px] text-[12px] font-bold shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1">
              <div className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center"><Plus size={14} strokeWidth={3} /></div> Add Projects
            </button>
            <button className="flex items-center gap-2 bg-white border border-gray-100 px-6 py-3 rounded-[18px] text-[12px] font-black text-gray-800 shadow-xl hover:bg-gray-50 transition-all transform hover:-translate-y-1">
              <FileUp size={16} className="text-blue-500" /> Import
            </button>
            <button disabled={selectedProjects.length === 0} onClick={handleEdit} className={`flex items-center gap-2 bg-white border border-gray-100 px-6 py-3 rounded-[18px] text-[12px] font-black text-gray-800 shadow-xl hover:bg-gray-50 transition-all transform hover:-translate-y-1 ${selectedProjects.length === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
              <Edit3 size={16} className="text-purple-500" /> Edit List
            </button>
          </div>
          <button onClick={() => setIsOutreachActive(!isOutreachActive)} className={`${isOutreachActive ? 'bg-orange-500' : 'bg-blue-600'} text-white px-8 py-3 rounded-[24px] font-black text-[12px] tracking-widest flex items-center gap-3 hover:-translate-y-1 shadow-lg transition-all group`}>
            {isOutreachActive ? <><Pause size={16} fill="white" /> PAUSE OUTREACH</> : <><Play size={16} fill="white" /> START OUTREACH</>}
          </button>
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