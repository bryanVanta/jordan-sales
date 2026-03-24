/**
 * Product Service
 * Handle product/service management with AI training data in Firestore
 * Each product document contains: product info + AI instructions + knowledge base
 * Single unified table for all product data
 */

const { db } = require('../config/firebase');

// Create a new product (with AI training data)
async function createProduct(data) {
  try {
    const docRef = db.collection('products').doc();
    const productId = docRef.id;

    await docRef.set({
      // Product Information
      productName: data.productName,
      productType: data.productType,
      description: data.description,
      targetCustomer: data.targetCustomer,
      location: data.location,
      
      // AI Training Data
      instructions: data.instructions,
      knowledge: data.knowledge,
      
      // Metadata
      id: productId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      id: productId,
      productName: data.productName,
      productType: data.productType,
      description: data.description,
      targetCustomer: data.targetCustomer,
      location: data.location,
      instructions: data.instructions,
      knowledge: data.knowledge,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

// Get product by ID
async function getProduct(productId) {
  try {
    const doc = await db.collection('products').doc(productId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting product:', error);
    throw error;
  }
}

// Get all products
async function getAllProducts() {
  try {
    const snapshot = await db.collection('products').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting all products:', error);
    throw error;
  }
}

// Update product
async function updateProduct(productId, data) {
  try {
    const docRef = db.collection('products').doc(productId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Product not found');
    }

    await docRef.update({
      ...data,
      updatedAt: new Date(),
    });

    return {
      id: productId,
      ...doc.data(),
      ...data,
      updatedAt: new Date(),
    };
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

// Delete product
async function deleteProduct(productId) {
  try {
    await db.collection('products').doc(productId).delete();
    return { id: productId, deleted: true };
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

// Get product by name (useful for AI interactions)
async function getProductByName(productName) {
  try {
    const snapshot = await db
      .collection('products')
      .where('productName', '==', productName)
      .limit(1)
      .get();

    if (snapshot.docs.length === 0) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting product by name:', error);
    throw error;
  }
}

module.exports = {
  createProduct,
  getProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductByName,
};
