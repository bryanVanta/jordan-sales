"use client";

import React, { useState, useRef } from 'react';
import { 
  ChevronDown, 
  Upload, 
  Search, 
  Clock, 
  Terminal, 
  Database, 
  Briefcase, 
  Zap, 
  BrainCircuit,
  Settings,
  ShieldCheck,
  Plus,
  ChevronRight,
  X,
  Save
} from 'lucide-react';

export default function TrainingPage() {
  const [styleAndTone, setStyleAndTone] = useState('Default');
  const [showToneDropdown, setShowToneDropdown] = useState(false);
  const [characteristics, setCharacteristics] = useState('');
  const [customerInstructions, setCustomerInstructions] = useState('');
  const [autoSales, setAutoSales] = useState(false);
  
  const [referenceMemories, setReferenceMemories] = useState(true);
  const [referenceChatHistory, setReferenceChatHistory] = useState(true);

  const [productName, setProductName] = useState('');
  const [targetCustomer, setTargetCustomer] = useState('');
  const [productType, setProductType] = useState('Service');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [benefit, setBenefit] = useState('');
  const [moreAboutProduct, setMoreAboutProduct] = useState('');

  // Upload Logic states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ [key: string]: string }>({});

  const toneOptions = ['Default', 'Professional', 'Casual', 'Enthusiastic', 'Precise', 'Witty', 'Aggressive'];
  const productTypeOptions = ['Service', 'Product', 'Software', 'Consulting', 'Agency', 'Other'];

  const AppleToggle = ({ enabled, setEnabled, label }: { enabled: boolean, setEnabled: (v: boolean) => void, label?: string }) => (
    <div className="flex items-center justify-between group cursor-pointer" onClick={() => setEnabled(!enabled)}>
      {label && <span className="text-[13px] font-bold text-gray-700 tracking-tight group-hover:text-black transition-colors">{label}</span>}
      <div className={`w-11 h-6 rounded-full p-1 transition-all duration-300 ease-in-out ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
      </div>
    </div>
  );

  const FormInput = ({ label, value, onChange, placeholder, type = "text" }: any) => (
    <div className="space-y-1.5 flex flex-col items-start w-full">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-[13px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-200 outline-none transition-all placeholder:text-gray-300 shadow-sm"
      />
    </div>
  );

  const FormSelect = ({ label, value, onChange, options }: any) => (
    <div className="space-y-1.5 flex flex-col items-start w-full">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-[13px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-200 outline-none transition-all shadow-sm"
      >
        {options.map((option: string) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );

  const triggerUpload = (label: string) => {
    setUploadingAsset(label);
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingAsset) {
      setUploadedFiles(prev => ({ ...prev, [uploadingAsset]: file.name }));
    }
  };

  return (
    <div className="flex flex-col min-h-full px-4 sm:px-8 lg:px-12 relative overflow-hidden pb-40 lg:pb-32">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
      
      {/* Background accents consistent with other pages */}
      <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute bottom-0 left-0 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-start z-10 mt-4 sm:mt-10 max-w-[1600px] mx-auto w-full">
        
        {/* ================= LEFT COLUMN: Personalize Jordan ================= */}
        <div className="flex flex-col bg-white/80 backdrop-blur-3xl rounded-[32px] border border-white p-6 sm:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.06)]">
           <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 flex-shrink-0">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Settings size={20} /></div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Personalize Jordan</h2>
           </div>

           <div className="flex flex-col gap-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[13px] font-bold text-gray-800 tracking-tight">Style and Tone</span>
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Base personality profile</span>
                </div>
                <div className="relative w-full sm:w-auto">
                  <button 
                    onClick={() => setShowToneDropdown(!showToneDropdown)}
                    className="flex items-center justify-between w-full sm:w-auto bg-white border border-gray-100 px-4 py-2.5 rounded-xl text-[12px] font-black text-gray-800 shadow-sm hover:border-blue-200 transition-all min-w-[160px]"
                  >
                    {styleAndTone} <ChevronDown size={14} className={`ml-2 opacity-30 transition-transform ${showToneDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showToneDropdown && (
                    <div className="absolute top-full right-0 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
                      {toneOptions.map(tone => (
                        <button 
                          key={tone}
                          onClick={() => { setStyleAndTone(tone); setShowToneDropdown(false); }}
                          className={`w-full text-left px-4 py-2.5 text-[11px] font-bold hover:bg-gray-50 transition-colors ${styleAndTone === tone ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600'}`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <FormInput label="Characteristics" value={characteristics} onChange={setCharacteristics} placeholder="e.g. Professional, witty, detail-oriented" />
                <div className="space-y-1.5 flex flex-col items-start">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer Instructions</label>
                  <textarea 
                    value={customerInstructions}
                    onChange={(e) => setCustomerInstructions(e.target.value)}
                    placeholder="How should Jordan handle specific customer objections?"
                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-[13px] font-bold text-gray-800 h-24 sm:h-32 resize-none focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-50">
                <AppleToggle enabled={autoSales} setEnabled={setAutoSales} label="Auto-sales Engine" />
                <div className={`mt-6 space-y-4 overflow-hidden transition-all duration-500 ${autoSales ? 'max-h-[800px] opacity-100 pb-4' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                  {[
                    { label: 'Scraping Time', icon: <Clock size={16} className="text-blue-500" /> },
                    { label: 'Sending Limits', icon: <ShieldCheck size={16} className="text-orange-500" /> },
                    { label: 'Working Hours', icon: <Zap size={16} className="text-amber-500" /> }
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-gray-50/50 p-4 rounded-2xl border border-gray-50/50 gap-4">
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span className="text-[12px] font-black text-gray-700 uppercase tracking-tight">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <input placeholder="Start" className="flex-1 sm:w-20 bg-white border border-gray-100 py-2 rounded-lg text-center text-[12px] font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm" />
                         <span className="text-gray-300">/</span>
                         <input placeholder="End" className="flex-1 sm:w-20 bg-white border border-gray-100 py-2 rounded-lg text-center text-[12px] font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-50 flex flex-col gap-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuit size={16} className="text-purple-600" />
                  <span className="text-[13px] font-black text-gray-900 uppercase tracking-widest">Cognitive Memory</span>
                </div>
                <AppleToggle enabled={referenceMemories} setEnabled={setReferenceMemories} label="Reference saved deep-memories" />
                <AppleToggle enabled={referenceChatHistory} setEnabled={setReferenceChatHistory} label="Reference live chat history" />
              </div>
           </div>
        </div>


        {/* ================= RIGHT COLUMN: Product & Services ================= */}
        <div className="flex flex-col bg-white/80 backdrop-blur-3xl rounded-[32px] border border-white p-6 sm:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.06)] max-h-[calc(100vh-12rem)] overflow-hidden">
           <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 flex-shrink-0">
              <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Briefcase size={20} /></div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Product & Services</h2>
           </div>

           <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
              <FormInput label="Product Name" value={productName} onChange={setProductName} placeholder="e.g. Acme Enterprise AI" />
              <FormInput label="Description" value={description} onChange={setDescription} placeholder="Brief summary" />
              <FormInput label="Key Benefit" value={benefit} onChange={setBenefit} placeholder="Main selling point" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Target Customer" value={targetCustomer} onChange={setTargetCustomer} placeholder="e.g. Hotels, restaurants, clinics" />
                <FormSelect label="Product Type" value={productType} onChange={setProductType} options={productTypeOptions} />
              </div>
              <FormInput label="Location" value={location} onChange={setLocation} placeholder="e.g. Kuala Lumpur, Malaysia" />

              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Training Assets</label>
                {[
                  { label: 'Company Info', icon: <Briefcase size={16} /> },
                  { label: 'Knowledge Base', icon: <Database size={16} /> },
                  { label: 'Sales Playbook', icon: <Terminal size={16} /> }
                ].map((item) => (
                  <div key={item.label} className="flex flex-col bg-gray-50/50 p-1 rounded-2xl border border-gray-100 group hover:border-blue-200 hover:bg-white transition-all overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 sm:px-5 py-3.5 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="text-gray-400 group-hover:text-blue-600 transition-colors">{item.icon}</div>
                        <span className="text-[13px] font-bold text-gray-700">{item.label}</span>
                      </div>
                      <button 
                        onClick={() => triggerUpload(item.label)}
                        className="flex items-center justify-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl text-[11px] font-black text-gray-800 shadow-sm hover:bg-gray-50 uppercase tracking-tight"
                      >
                        <Upload size={14} className="text-blue-600" /> {uploadedFiles[item.label] ? 'Replace' : 'Upload'}
                      </button>
                    </div>
                    {uploadedFiles[item.label] && (
                       <div className="bg-emerald-50 px-5 py-2.5 flex items-center justify-between border-t border-emerald-100/50">
                          <div className="flex items-center gap-2 truncate">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             <span className="text-[10px] font-black text-emerald-700 truncate">{uploadedFiles[item.label]}</span>
                          </div>
                          <button onClick={() => setUploadedFiles(prev => { const n = {...prev}; delete n[item.label]; return n; })} className="text-emerald-500 hover:text-emerald-700"><X size={12} /></button>
                       </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 flex flex-col items-start pt-2 pb-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">More about your product</label>
                <textarea 
                  value={moreAboutProduct}
                  onChange={(e) => setMoreAboutProduct(e.target.value)}
                  placeholder="Any additional context for Jordan to sound like an expert..."
                  className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-[13px] font-bold text-gray-800 h-28 sm:h-32 resize-none focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm"
                />
              </div>
           </div>
        </div>
      </div>

      {/* FIXED FOOTER BUTTONS */}
      <div className="fixed bottom-24 lg:bottom-[40px] left-0 right-0 px-4 sm:px-10 lg:px-20 pointer-events-none z-50">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full max-w-[1600px] mx-auto pointer-events-auto gap-3">
          <div className="flex items-center justify-center">
            <button className="flex items-center justify-center gap-2 bg-gray-900 border border-white/10 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-[22px] font-black text-[11px] sm:text-[12px] tracking-[0.1em] shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1 uppercase w-full sm:w-auto">
              <Save size={16} className="text-blue-500" /> Save Changes
            </button>
          </div>
          <button className="flex items-center justify-center gap-3 bg-blue-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-[22px] font-black text-[11px] sm:text-[12px] tracking-[0.2em] shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:bg-black hover:-translate-y-1 transition-all active:scale-95 uppercase group border border-white/10">
            <Search size={18} className="group-hover:rotate-12 transition-transform" /> 
            Find Leads
            <ChevronRight size={16} className="ml-1 opacity-50 group-hover:translate-x-1 transition-transform" />
          </button>
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
}
