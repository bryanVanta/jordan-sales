const { db } = require('../config/firebase');

/**
 * Create a new lead
 */
const createLead = async (leadData) => {
  try {
    const lead = {
      ...leadData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('leads').add(lead);
    return {
      id: docRef.id,
      ...lead,
    };
  } catch (error) {
    console.error('Error creating lead:', error.message);
    throw error;
  }
};

/**
 * Get all leads for a product
 */
const getLeadsByProduct = async (productId) => {
  try {
    const snapshot = await db.collection('leads')
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .get();

    const leads = [];
    snapshot.forEach((doc) => {
      leads.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return leads;
  } catch (error) {
    console.error('Error getting leads:', error.message);
    throw error;
  }
};

/**
 * Get all leads
 */
const getAllLeads = async () => {
  try {
    const snapshot = await db.collection('leads')
      .orderBy('createdAt', 'desc')
      .get();

    const leads = [];
    snapshot.forEach((doc) => {
      leads.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return leads;
  } catch (error) {
    console.error('Error getting all leads:', error.message);
    throw error;
  }
};

/**
 * Update lead temperature
 */
const updateLeadTemperature = async (leadId, temperature) => {
  try {
    await db.collection('leads').doc(leadId).update({
      leadTemperature: temperature,
      updatedAt: new Date(),
    });

    const doc = await db.collection('leads').doc(leadId).get();
    return {
      id: doc.id,
      ...doc.data(),
    };
  } catch (error) {
    console.error('Error updating lead temperature:', error.message);
    throw error;
  }
};

/**
 * Bulk create leads
 */
const bulkCreateLeads = async (leadsArray) => {
  try {
    const batch = db.batch();
    const created = [];

    for (const leadData of leadsArray) {
      const lead = {
        ...leadData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = db.collection('leads').doc();
      batch.set(docRef, lead);
      created.push({
        id: docRef.id,
        ...lead,
      });
    }

    await batch.commit();
    return created;
  } catch (error) {
    console.error('Error bulk creating leads:', error.message);
    throw error;
  }
};

/**
 * Delete lead
 */
const deleteLead = async (leadId) => {
  try {
    await db.collection('leads').doc(leadId).delete();
    return { success: true };
  } catch (error) {
    console.error('Error deleting lead:', error.message);
    throw error;
  }
};

module.exports = {
  createLead,
  getLeadsByProduct,
  getAllLeads,
  updateLeadTemperature,
  bulkCreateLeads,
  deleteLead,
};
