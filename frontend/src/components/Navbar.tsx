"use client";
import React, { useEffect, useState, Suspense } from 'react';
import { ChevronDown, ChevronRight, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const SELECTED_PROJECT_STORAGE_KEY = 'jordan:selectedProjectId';
const PROJECT_CHANGED_EVENT = 'jordan:projectChanged';

const NavbarContent = () => {
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('current');
  const [selectedProjectName, setSelectedProjectName] = useState<string>('Jordan Projects');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const API_BASE_URL = `${BACKEND_URL}/api`;
  const productInfoIdFromUrl = searchParams.get('productInfoId');

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    if (pathname === '/leads') return 'Projects';
    if (pathname.includes('/chats')) {
      const platform = searchParams.get('platform');
      if (platform === 'telegram') return 'Telegram';
      if (platform === 'email') return 'Email';
      return 'WhatsApp';
    }
    if (pathname.includes('/training')) return 'Training';
    return 'Dashboard';
  };

  const loadProjects = async () => {
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/product-info`, { cache: 'no-store' });
      if (!response.ok) {
        // Backwards-compatible fallback if backend hasn't been restarted yet (no list endpoint)
        if (response.status === 404) {
          const currentResponse = await fetch(`${API_BASE_URL}/product-info/current`, { cache: 'no-store' });
          if (currentResponse.ok) {
            const currentResult = await currentResponse.json();
            const current = currentResult?.data;
            if (current) {
              setProjects([
                {
                  id: String(current.id || 'current'),
                  name: (current.productName || '').trim() || 'Current Project',
                },
              ]);
              return;
            }
          }
        }

        setProjectsError('Could not load projects.');
        return;
      }
      const result = await response.json();
      const items = Array.isArray(result.data) ? result.data : [];
      setProjects(
        items.map((item: any) => ({
          id: String(item.id),
          name: (item.productName || '').trim() || (item.id === 'current' ? 'Current Project' : 'Untitled Project'),
        }))
      );
    } catch {
      // Most common: backend not running / wrong port
      setProjectsError(`Could not load projects (backend: ${BACKEND_URL}).`);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedProject = (id: string) => {
    setSelectedProjectId(id);
    try {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, id);
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id } }));
    } catch {}
  };

  useEffect(() => {
    if (productInfoIdFromUrl) {
      setSelectedProject(productInfoIdFromUrl);
      return;
    }

    try {
      const stored = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
      if (stored) setSelectedProjectId(stored);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productInfoIdFromUrl]);

  useEffect(() => {
    if (selectedProjectId === 'new') {
      setSelectedProjectName('New Project');
      return;
    }

    const match = projects.find((proj) => proj.id === selectedProjectId);
    if (match) {
      setSelectedProjectName(match.name);
      return;
    }

    if (selectedProjectId === 'current') {
      setSelectedProjectName('Current Project');
      return;
    }

    setSelectedProjectName('Selected Project');
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (showProfilePopup) {
      loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfilePopup]);

  const handleSelectProject = (id: string) => {
    setShowProfilePopup(false);
    setSelectedProject(id);

    if (pathname.startsWith('/leads')) {
      router.push(`/leads?productInfoId=${encodeURIComponent(id)}`);
      return;
    }

    router.push(`/training?productInfoId=${encodeURIComponent(id)}`);
  };

  const handleAddProject = () => {
    setShowProfilePopup(false);
    setSelectedProject('new');
    setSelectedProjectName('New Project');
    router.push('/training?productInfoId=new');
  };

  return (
    <nav className="flex items-center justify-between px-8 py-3 w-full max-w-[1600px] mx-auto bg-transparent z-[100] relative">
      <div className="flex-1 flex items-center">
        <span className="text-xl font-bold tracking-tight text-white border-b-2 border-transparent pb-1">Jordan</span>
      </div>
      
      <div className="flex-1 flex items-center justify-center">
        <Link href="/">
          <span className="text-[1.1rem] font-medium text-white tracking-wide font-sans cursor-pointer hover:text-gray-200">
            {getPageTitle()}
          </span>
        </Link>
      </div>
      
      <div className="flex-1 flex items-center justify-end relative">
        <div 
          onClick={() => setShowProfilePopup(!showProfilePopup)}
          className={`flex items-center space-x-3 cursor-pointer group rounded-full py-1.5 px-3 transition-all duration-300 ${showProfilePopup ? 'bg-gray-800' : 'hover:bg-gray-800/40'}`}
        >
          {/* Avatar on the left */}
          <div className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center bg-[#f2e1ff] overflow-hidden shadow-sm shrink-0">
            <div className="w-6 h-6 rounded-full bg-[#3f2a70] relative mt-3"></div>
          </div>
          
          {/* Text block on the right */}
          <div className="flex flex-col items-start justify-center">
            <span className="text-[14px] font-bold text-white leading-tight mb-0.5">Jordan</span>
            <span className="text-[11px] font-medium text-gray-400 leading-tight">{selectedProjectName}</span>
          </div>

          {/* Chevron */}
          <ChevronDown size={16} className={`text-gray-400 ml-1 group-hover:text-white transition-transform duration-300 ${showProfilePopup ? 'rotate-180' : ''}`} />
        </div>

        {/* Profile Pop-up Modal */}
        {showProfilePopup && (
          <>
            {/* Click outside to close backdrop */}
            <div className="fixed inset-0 z-[-1]" onClick={() => setShowProfilePopup(false)}></div>
            
            <div className="absolute top-16 right-0 w-[280px] bg-white rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-gray-100 p-6 z-[110] animate-in fade-in slide-in-from-top-4 duration-300">
              {/* Pop-up Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#f2e1ff] flex items-center justify-center overflow-hidden shrink-0 border border-gray-100">
                   <div className="w-8 h-8 rounded-full bg-[#3f2a70] relative mt-4"></div>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-900 font-extrabold text-[15px] leading-tight">Jordan</span>
                  <span className="text-gray-500 font-semibold text-[11px]">{selectedProjectName}</span>
                </div>
              </div>

              {/* Separator Line */}
              <div className="h-[1px] w-full bg-gray-100 mb-6"></div>

              {/* Projects List */}
              <div className="space-y-4 mb-8">
                {projectsLoading ? (
                  <div className="text-gray-400 font-semibold text-[12px]">Loading projects...</div>
                ) : projectsError ? (
                  <div className="text-gray-400 font-semibold text-[12px]">{projectsError}</div>
                ) : projects.length === 0 ? (
                  <div className="text-gray-400 font-semibold text-[12px]">No projects yet. Click “Add Project”.</div>
                ) : (
                  projects.map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => handleSelectProject(proj.id)}
                      className={`group flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1.5 -mx-1.5 rounded-xl transition-colors ${
                        proj.id === selectedProjectId ? 'bg-gray-50' : ''
                      }`}
                    >
                      <span className="text-gray-700 font-bold text-[13.5px] tracking-tight">{proj.name}</span>
                      <ChevronRight size={18} className="text-gray-400 group-hover:text-gray-900 transition-colors" />
                    </div>
                  ))
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-auto">
                <button
                  onClick={handleAddProject}
                  className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-800 text-[11px] font-black py-2.5 rounded-2xl flex items-center justify-center gap-1.5 border border-gray-200 transition-colors"
                >
                  <Plus size={14} strokeWidth={3} /> Add Project
                </button>
                <button className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-800 text-[11px] font-black py-2.5 rounded-2xl flex items-center justify-center gap-1.5 border border-gray-200 transition-colors">
                  <User size={14} strokeWidth={3} /> Edit Profile
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

const Navbar = () => (
  <Suspense fallback={null}>
    <NavbarContent />
  </Suspense>
);

export default Navbar;
