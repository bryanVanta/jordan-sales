/**
 * Leads Routes
 * CRUD endpoints for leads
 */

const express = require('express');
const router = express.Router();
const {
  createLead,
  getLead,
  getAllLeads,
  getLeadsByProductInfoId,
  getLeadsByCompany,
  updateLead,
} = require('../services/firestoreService');

// Get all leads
router.get('/', async (req, res) => {
  try {
    const productInfoId = req.query.productInfoId ? String(req.query.productInfoId) : '';
    const leads = productInfoId ? await getLeadsByProductInfoId(productInfoId) : await getAllLeads();
    res.json({ success: true, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leads by company
router.get('/company/:companyId', async (req, res) => {
  try {
    const leads = await getLeadsByCompany(req.params.companyId);
    res.json({ success: true, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single lead
router.get('/:id', async (req, res) => {
  try {
    const lead = await getLead(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create lead
router.post('/', async (req, res) => {
  try {
    const lead = await createLead(req.body);
    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update lead
router.put('/:id', async (req, res) => {
  try {
    const lead = await updateLead(req.params.id, req.body);
    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
