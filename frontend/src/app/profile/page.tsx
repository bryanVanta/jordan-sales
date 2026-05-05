'use client';

import React, { useEffect, useState } from 'react';
import { useProfile } from '../context/ProfileContext';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Check,
  Save,
  Upload,
  User,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { profileService } from '../../services/profile';

type FormData = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>;

type FieldProps = {
  label: string;
  name: keyof FormData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
};

type SelectProps = {
  label: string;
  name: keyof FormData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
};

const baseFieldClass =
  'w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-[13px] font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-200 outline-none transition-all placeholder:text-gray-300 shadow-sm';

const FormInput = ({ label, name, value, onChange, placeholder, type = 'text', required }: FieldProps) => (
  <div className="space-y-1.5 flex flex-col items-start w-full">
    <label htmlFor={String(name)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
      {label}
    </label>
    <input
      id={String(name)}
      type={type}
      name={String(name)}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={baseFieldClass}
      required={required}
    />
  </div>
);

const FormSelect = ({ label, name, value, onChange, options }: SelectProps) => (
  <div className="space-y-1.5 flex flex-col items-start w-full">
    <label htmlFor={String(name)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
      {label}
    </label>
    <select id={String(name)} name={String(name)} value={value} onChange={onChange} className={baseFieldClass}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const EditProfilePage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    firstName: 'Jordan',
    lastName: 'Salesbot',
    email: 'jordan@salesbot.ai',
    phone: '',
    company: '',
    title: '',
    bio: '',
    avatar: '',
  });
  const { profile, setProfile, refreshProfile } = useProfile();

  // Revert changes if user navigates away without saving
  useEffect(() => {
    return () => {
      refreshProfile();
    };
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const fetchedProfile = await profileService.getProfile();
        setFormData({
          firstName: fetchedProfile.firstName || 'Jordan',
          lastName: fetchedProfile.lastName || 'Salesbot',
          email: fetchedProfile.email || '',
          phone: fetchedProfile.phone || '',
          company: fetchedProfile.company || '',
          title: fetchedProfile.title || '',
          bio: fetchedProfile.bio || '',
          avatar: fetchedProfile.avatar || '',
        });
        if (fetchedProfile.avatar) setAvatarPreview(fetchedProfile.avatar);
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
      };
      // Instantly reflect in the navbar
      if (profile) {
        setProfile({ ...profile, ...newData } as UserProfile);
      }
      return newData;
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError('');

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setAvatarPreview(dataUrl);
      };
      reader.readAsDataURL(file);

      const url = await profileService.uploadAvatar(file);
      setFormData((prev) => {
        const newData = {
          ...prev,
          avatar: url,
        };
        // Instantly reflect in the navbar
        if (profile) {
          setProfile({ ...profile, ...newData } as UserProfile);
        }
        return newData;
      });
    } catch (err) {
      setError('Failed to upload avatar');
      console.error('Avatar upload error:', err);
    }
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess(false);

      const updated = await profileService.updateProfile(formData);
      setProfile(updated);
      await refreshProfile();

      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile();
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">Loading profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 sm:px-8 lg:px-12 pt-2 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      <form onSubmit={handleSubmit} className="z-10 mt-4 sm:mt-10 max-w-[1200px] mx-auto w-full pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center bg-white border border-gray-100 rounded-xl text-gray-600 shadow-sm hover:bg-gray-50 hover:border-blue-200 transition-all"
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Settings</p>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Edit Profile</h1>
            </div>
          </div>

          {(error || success) && (
            <div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-[12px] font-black ${
                error
                  ? 'bg-red-50 border-red-100 text-red-700'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
              }`}
            >
              {error ? <AlertCircle size={16} /> : <Check size={16} />}
              {error || 'Profile updated successfully.'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-6 sm:gap-10 items-start">
          <div className="flex flex-col bg-white/80 backdrop-blur-3xl rounded-[32px] border border-white p-6 sm:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <User size={20} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Profile Identity</h2>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex gap-5 items-start">
                <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center overflow-hidden border border-gray-100 shrink-0 shadow-sm">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#3f2a70]" />
                  )}
                </div>
                <div className="flex flex-col items-start gap-2 pt-1">
                  <label className="flex items-center justify-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl text-[11px] font-black text-gray-800 shadow-sm hover:bg-gray-50 hover:border-blue-200 uppercase tracking-tight cursor-pointer transition-all">
                    <Upload size={14} className="text-blue-600" /> Add Photo
                    <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  </label>
                  <p className="text-[10px] font-bold text-gray-400">JPG, PNG or GIF. Max 5MB.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="First Name" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
                <FormInput label="Last Name" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
              </div>

              <FormInput label="Email Address" name="email" value={formData.email} onChange={handleInputChange} type="email" required />
              <FormInput label="Phone Number" name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="+1 (555) 000-0000" type="tel" />
            </div>
          </div>

          <div className="flex flex-col bg-white/80 backdrop-blur-3xl rounded-[32px] border border-white p-6 sm:p-8 shadow-[0_40px_80px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
              <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
                <Briefcase size={20} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Work Details</h2>
            </div>

            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Company" name="company" value={formData.company || ''} onChange={handleInputChange} />
                <FormInput label="Job Title" name="title" value={formData.title || ''} onChange={handleInputChange} placeholder="e.g. Sales Director" />
              </div>

              <div className="space-y-1.5 flex flex-col items-start">
                <label htmlFor="bio" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio || ''}
                  onChange={handleInputChange}
                  placeholder="Tell us about yourself..."
                  className={`${baseFieldClass} h-28 sm:h-32 resize-none`}
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      <div className="shrink-0 flex gap-3 px-4 sm:px-8 py-4 bg-white/90 border-t border-gray-50 sticky bottom-0 z-20">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center justify-center bg-white border border-gray-100 text-gray-800 px-5 sm:px-6 py-3 rounded-[18px] font-black text-[11px] tracking-[0.1em] shadow-sm hover:bg-gray-50 transition-all uppercase"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className="ml-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-6 sm:px-8 py-3 rounded-[18px] font-black text-[11px] tracking-[0.1em] shadow-[0_15px_40px_rgba(37,99,235,0.28)] hover:bg-black hover:-translate-y-0.5 transition-all uppercase disabled:opacity-60 disabled:transform-none"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving
            </>
          ) : (
            <>
              <Save size={16} />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EditProfilePage;
