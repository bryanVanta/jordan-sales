/**
 * Companies Routes
 * CRUD endpoints for companies
 */

const express = require('express');
const router = express.Router();
const {
  createCompany,
  getCompany,
  getAllCompanies,
  updateCompany,
  deleteCompany,
} = require('../services/firestoreService');

// Get all companies
router.get('/', async (req, res) => {
  try {
    const companies = await getAllCompanies();
    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single company
router.get('/:id', async (req, res) => {
  try {
    const company = await getCompany(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create company
router.post('/', async (req, res) => {
  try {
    const company = await createCompany(req.body);
    res.status(201).json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update company
router.put('/:id', async (req, res) => {
  try {
    const company = await updateCompany(req.params.id, req.body);
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete company
router.delete('/:id', async (req, res) => {
  try {
    await deleteCompany(req.params.id);
    res.json({ success: true, message: 'Company deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
