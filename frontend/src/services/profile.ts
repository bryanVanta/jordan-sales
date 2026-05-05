import { UserProfile } from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
const API_BASE_URL = `${BACKEND_URL}/api`;

export const profileService = {
  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    const result = await response.json();
    return result.data || result;
  },

  /**
   * Update user profile
   */
  async updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
    });

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }

    const result = await response.json();
    return result.data || result;
  },

  /**
   * Upload profile avatar
   */
  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/profile/avatar`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload avatar');
    }

    const result = await response.json();
    return result.data?.url || result.url;
  },
};
