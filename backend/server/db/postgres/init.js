const fs = require('fs');
const path = require('path');
const { query, hasPostgresConfig } = require('../../config/postgres');
const { db } = require('../../config/firebase');

/**
 * Seed historical sentiment data from Firestore if the Postgres table is empty.
 */
async function seedSentimentHistory() {
  try {
    const checkRes = await query('SELECT count(*) FROM lead_sentiment_history');
    if (parseInt(checkRes.rows[0].count, 10) > 0) {
      return;
    }

    console.log('🌱 Seeding sentiment history from Firestore...');
    const snapshot = await db.collection('leads').get();
    let seededCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const sentiment = String(data.sentiment || '').trim().toLowerCase();
      if (!['hot', 'warm', 'cold'].includes(sentiment)) continue;

      const lastUpdated = data.sentimentLastUpdated?.toDate?.() || 
                          data.updatedAt?.toDate?.() || 
                          data.createdAt?.toDate?.() || 
                          new Date();

      await query(
        `INSERT INTO lead_sentiment_history (lead_id, sentiment, product_info_id, recorded_at)
         VALUES ($1, $2, $3, $4)`,
        [doc.id, sentiment, data.productInfoId || data.product_info_id || 'current', lastUpdated]
      );
      seededCount++;
    }

    console.log(`✅ Seeded ${seededCount} historical records.`);
  } catch (err) {
    console.warn('⚠️  Could not seed sentiment history:', err.message);
  }
}

/**
 * PostgreSQL Database Initialization
 * Runs migration scripts to ensure the schema is up to date.
 */
async function initializeDatabase() {
  if (!hasPostgresConfig()) {
    console.log('ℹ️  PostgreSQL not enabled, skipping database initialization.');
    return;
  }

  try {
    console.log('🐘 Initializing PostgreSQL database...');
    
    // List of migration files in order
    const migrations = [
      '001_training_documents.sql',
      '002_lead_sentiment_history.sql'
    ];

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        console.log(`📜 Running migration: ${file}`);
        const sql = fs.readFileSync(filePath, 'utf8');
        await query(sql);
      }
    }

    // Seed history if empty
    await seedSentimentHistory();

    console.log('✅ PostgreSQL database initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL database:', error.message);
    // Don't crash the server, just log the error
  }
}

module.exports = {
  initializeDatabase
};
