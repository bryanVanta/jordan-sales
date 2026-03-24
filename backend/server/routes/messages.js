/**
 * Messages Routes
 * CRUD endpoints for messages
 */

const express = require('express');
const router = express.Router();
const {
  createMessage,
  getMessagesByLead,
} = require('../services/firestoreService');

// Get messages by lead
router.get('/:leadId', async (req, res) => {
  try {
    const messages = await getMessagesByLead(req.params.leadId);
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create message
router.post('/', async (req, res) => {
  try {
    const message = await createMessage(req.body);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
