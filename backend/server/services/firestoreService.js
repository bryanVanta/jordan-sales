/**
 * Firestore Service
 * Handle all Firestore database operations
 */

const { db } = require('../config/firebase');

// Companies
async function createCompany(data) {
  try {
    const docRef = await db.collection('companies').add({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error('Error creating company:', error);
    throw error;
  }
}

async function getCompany(id) {
  try {
    const doc = await db.collection('companies').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (error) {
    console.error('Error getting company:', error);
    throw error;
  }
}

async function getAllCompanies() {
  try {
    const snapshot = await db.collection('companies').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting companies:', error);
    throw error;
  }
}

async function updateCompany(id, data) {
  try {
    await db.collection('companies').doc(id).update({
      ...data,
      updatedAt: new Date(),
    });
    return { id, ...data };
  } catch (error) {
    console.error('Error updating company:', error);
    throw error;
  }
}

async function deleteCompany(id) {
  try {
    await db.collection('companies').doc(id).delete();
    return { id };
  } catch (error) {
    console.error('Error deleting company:', error);
    throw error;
  }
}

// Leads
async function createLead(data) {
  try {
    const docRef = await db.collection('leads').add({
      ...data,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error('Error creating lead:', error);
    throw error;
  }
}

async function getLead(id) {
  try {
    const doc = await db.collection('leads').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (error) {
    console.error('Error getting lead:', error);
    throw error;
  }
}

async function getAllLeads() {
  try {
    const snapshot = await db.collection('leads').orderBy('updatedAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting all leads:', error);
    throw error;
  }
}

async function getLeadsByProductInfoId(productInfoId) {
  try {
    let snapshot;
    try {
      snapshot = await db
        .collection('leads')
        .where('productInfoId', '==', productInfoId)
        .orderBy('updatedAt', 'desc')
        .get();
    } catch (error) {
      // Be resilient to missing composite index / mixed updatedAt types.
      snapshot = await db.collection('leads').where('productInfoId', '==', productInfoId).get();
    }
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting leads by productInfoId:', error);
    throw error;
  }
}

async function getLeadsByCompany(companyId) {
  try {
    const snapshot = await db.collection('leads').where('companyId', '==', companyId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting leads by company:', error);
    throw error;
  }
}

async function updateLead(id, data) {
  try {
    await db.collection('leads').doc(id).update({
      ...data,
      updatedAt: new Date(),
    });
    return { id, ...data };
  } catch (error) {
    console.error('Error updating lead:', error);
    throw error;
  }
}

// Messages
async function createMessage(data) {
  try {
    const docRef = await db.collection('messages').add({
      ...data,
      createdAt: new Date(),
    });
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error('Error creating message:', error);
    throw error;
  }
}

async function getMessagesByLead(leadId) {
  try {
    const snapshot = await db.collection('messages')
      .where('leadId', '==', leadId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
}

module.exports = {
  // Companies
  createCompany,
  getCompany,
  getAllCompanies,
  updateCompany,
  deleteCompany,
  // Leads
  createLead,
  getLead,
  getAllLeads,
  getLeadsByProductInfoId,
  getLeadsByCompany,
  updateLead,
  // Messages
  createMessage,
  getMessagesByLead,
};
