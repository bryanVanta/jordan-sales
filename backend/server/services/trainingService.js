/**
 * Training Service
 * Handle AI bot training configuration in Firestore
 * Uses fixed document ID "current" to ensure only ONE training record exists
 */

const { db } = require('../config/firebase');
const TRAINING_DOC_ID = 'current'; // Fixed document ID for single training

// Save training configuration (always updates the single "current" document)
async function saveTraining(data) {
  try {
    const docRef = db.collection('training').doc(TRAINING_DOC_ID);
    const doc = await docRef.get();
    
    if (doc.exists) {
      // Update existing document
      await docRef.update({
        ...data,
        updatedAt: new Date(),
      });
      return { id: TRAINING_DOC_ID, ...data };
    } else {
      // Create new document
      await docRef.set({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: TRAINING_DOC_ID, ...data };
    }
  } catch (error) {
    console.error('Error saving training:', error);
    throw error;
  }
}

// Get training configuration
async function getTraining(id) {
  try {
    const doc = await db.collection('training').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (error) {
    console.error('Error getting training:', error);
    throw error;
  }
}

// Get latest training configuration (checks "current" first, then falls back to latest)
async function getLatestTraining() {
  try {
    // First try to get the "current" document
    const currentDoc = await db.collection('training').doc(TRAINING_DOC_ID).get();
    if (currentDoc.exists) {
      return { id: TRAINING_DOC_ID, ...currentDoc.data() };
    }
    
    // Fallback: get latest by updatedAt for backwards compatibility
    const snapshot = await db.collection('training')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.docs.length > 0) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting latest training:', error);
    throw error;
  }
}

// Update training configuration
async function updateTraining(id, data) {
  try {
    await db.collection('training').doc(id).update({
      ...data,
      updatedAt: new Date(),
    });
    return { id, ...data };
  } catch (error) {
    console.error('Error updating training:', error);
    throw error;
  }
}

module.exports = {
  saveTraining,
  getTraining,
  getLatestTraining,
  updateTraining,
};
