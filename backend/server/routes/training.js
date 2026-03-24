/**
 * Training Routes
 * API endpoints for AI bot training configuration
 */

const express = require('express');
const router = express.Router();
const {
  saveTraining,
  getTraining,
  getLatestTraining,
  updateTraining,
} = require('../services/trainingService');

// Save new training configuration
router.post('/', async (req, res) => {
  try {
    const training = await saveTraining(req.body);
    res.status(201).json({ success: true, data: training });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific training configuration
router.get('/:id', async (req, res) => {
  try {
    const training = await getTraining(req.params.id);
    if (!training) {
      return res.status(404).json({ success: false, error: 'Training not found' });
    }
    res.json({ success: true, data: training });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest training configuration
router.get('/', async (req, res) => {
  try {
    const training = await getLatestTraining();
    if (!training) {
      return res.status(404).json({ success: false, error: 'No training found' });
    }
    res.json({ success: true, data: training });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update training configuration
router.put('/:id', async (req, res) => {
  try {
    const training = await updateTraining(req.params.id, req.body);
    res.json({ success: true, data: training });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
