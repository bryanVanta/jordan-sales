/**
 * Profile Routes
 * Handle user profile endpoints
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const {
  getProfile,
  updateProfile,
  uploadAvatar,
} = require('../services/profileService');

const router = express.Router();

// Ensure uploads directories exist
const uploadDirs = [
  path.join(__dirname, '../../uploads'),
  path.join(__dirname, '../../uploads/temp'),
  path.join(__dirname, '../../uploads/avatars'),
];

Promise.all(uploadDirs.map(dir => fs.mkdir(dir, { recursive: true }))).catch(err => {
  console.error('Error creating upload directories:', err);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

/**
 * GET /api/profile
 * Get current user profile
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const profile = await getProfile(userId);
    
    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
});

/**
 * PUT /api/profile
 * Update user profile
 */
router.put('/', async (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      title,
      bio,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        error: 'firstName, lastName, and email are required',
      });
    }

    const profileData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      title: title?.trim() || '',
      bio: bio?.trim() || '',
    };

    const updatedProfile = await updateProfile(userId, profileData);

    res.json({
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

/**
 * POST /api/profile/avatar
 * Upload profile avatar
 */
router.post('/avatar', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const userId = req.query.userId || 'default-user';
    
    try {
      const result = await uploadAvatar(userId, req.file.path, req.file.originalname);

      // Clean up temp file
      try {
        await fs.unlink(req.file.path);
        console.log(`Deleted temp file: ${req.file.path}`);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      res.json({
        success: true,
        data: {
          url: result.url,
        },
        message: 'Avatar uploaded successfully',
      });
    } catch (uploadErr) {
      console.error('Error in uploadAvatar:', uploadErr);
      
      // Clean up temp file on error
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      res.status(500).json({
        success: false,
        error: uploadErr.message || 'Failed to upload avatar',
      });
    }
  } catch (error) {
    console.error('Error uploading avatar:', error);
    
    // Clean up temp file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload avatar',
    });
  }
});

module.exports = router;
