/**
 * Profile Service
 * Handle all profile-related operations
 */

const { db, admin } = require('../config/firebase');
const path = require('path');
const fs = require('fs').promises;
const cloudinary = require('../config/cloudinary');

// Default profile for demonstration
const DEFAULT_PROFILE = {
  id: 'default-user',
  firstName: 'Jordan',
  lastName: 'Salesbot',
  email: 'jordan@salesbot.ai',
  phone: '',
  company: 'Vanta Technologies',
  title: 'AI Sales Bot',
  bio: 'Automated sales prospecting with AI-powered personalization',
  avatar: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Get user profile
 */
async function getProfile(userId = 'default-user') {
  try {
    const doc = await db.collection('profiles').doc(userId).get();
    
    if (doc.exists) {
      return doc.data();
    }

    // Return default profile if not found
    return DEFAULT_PROFILE;
  } catch (error) {
    console.error('Error getting profile:', error);
    throw error;
  }
}

/**
 * Update user profile
 */
async function updateProfile(userId = 'default-user', profileData) {
  try {
    const updateData = {
      ...profileData,
      updatedAt: new Date(),
    };

    await db.collection('profiles').doc(userId).set(updateData, { merge: true });

    return {
      id: userId,
      ...updateData,
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

/**
 * Upload profile avatar
 */
async function uploadAvatar(userId = 'default-user', filePath, fileName) {
  try {
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `salesbot/avatars/${userId}`,
      public_id: `avatar-${Date.now()}`,
      overwrite: true,
      resource_type: 'image',
    });

    const avatarUrl = result.secure_url;

    // Update profile with Cloudinary URL
    await updateProfile(userId, { avatar: avatarUrl });

    return {
      url: avatarUrl,
      cloudinaryId: result.public_id,
    };
  } catch (error) {
    console.error('Error uploading avatar to Cloudinary:', error);
    throw error;
  }
}

/**
 * Delete user profile
 */
async function deleteProfile(userId = 'default-user') {
  try {
    await db.collection('profiles').doc(userId).delete();
    return { id: userId, deleted: true };
  } catch (error) {
    console.error('Error deleting profile:', error);
    throw error;
  }
}

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteProfile,
};
