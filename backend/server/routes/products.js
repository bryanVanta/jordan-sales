/**
 * Product Routes
 * API endpoints for product/service management
 */

const express = require('express');
const router = express.Router();
const {
  createProduct,
  getProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductByName,
} = require('../services/productService');

// Create a new product
router.post('/', async (req, res) => {
  try {
    const product = await createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const product = await updateProduct(req.params.id, req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteProduct(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get product by name
router.get('/name/:productName', async (req, res) => {
  try {
    const product = await getProductByName(req.params.productName);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
