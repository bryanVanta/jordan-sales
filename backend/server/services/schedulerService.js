/**
 * Scheduled Jobs Service
 * Manages background jobs that run on schedules (e.g., daily sentiment analysis at 8am Malay time)
 */

const cron = require('node-cron');
const { analyzeBatchSentiment } = require('./sentimentService');

let jobs = [];

/**
 * Schedule sentiment analysis at 8am Malay time (UTC+8) every day
 * 8am MYT = 0am UTC
 * Cron format: minute hour day month weekday
 * 0 0 * * * = every day at 00:00 UTC = 8am MYT
 */
const scheduleDailySentimentAnalysis = () => {
  try {
    console.log('[Scheduler] Setting up daily sentiment analysis at 8am Malay time...');
    
    // Schedule at 0am UTC (8am Malay time)
    const job = cron.schedule('0 0 * * *', async () => {
      console.log('\n[Scheduler] ⏰ Running scheduled sentiment analysis at 8am Malay time...');
      console.log(`[Scheduler] Timestamp: ${new Date().toISOString()}`);
      
      try {
        const results = await analyzeBatchSentiment();
        console.log('[Scheduler] ✅ Sentiment analysis completed successfully');
        console.log('[Scheduler] Results:', results);
      } catch (error) {
        console.error('[Scheduler] ❌ Error during scheduled sentiment analysis:', error.message);
      }
    }, {
      timezone: 'Asia/Kuala_Lumpur' // Ensures the schedule runs relative to Malay time
    });

    jobs.push({ name: 'daily_sentiment_analysis', job, schedule: '0 0 * * *', timezone: 'MYT' });
    console.log('[Scheduler] ✅ Daily sentiment analysis scheduled for 8am MYT\n');
    
    return job;
  } catch (error) {
    console.error('[Scheduler] Error scheduling sentiment analysis:', error.message);
  }
};

/**
 * Schedule sentiment analysis every 6 hours for frequent updates
 * Optional: Uncomment if you want more frequent analysis
 */
const scheduleFrequentSentimentAnalysis = () => {
  try {
    console.log('[Scheduler] Setting up frequent sentiment analysis every 6 hours...');
    
    // Every 6 hours: 0am, 6am, 12pm, 6pm UTC
    const job = cron.schedule('0 */6 * * *', async () => {
      console.log('\n[Scheduler] 📊 Running sentiment analysis (6-hour interval)...');
      
      try {
        const results = await analyzeBatchSentiment();
        console.log('[Scheduler] ✅ Sentiment analysis completed');
      } catch (error) {
        console.error('[Scheduler] ❌ Error:', error.message);
      }
    }, {
      timezone: 'Asia/Kuala_Lumpur'
    });

    jobs.push({ name: 'frequent_sentiment_analysis', job, schedule: '0 */6 * * *', timezone: 'MYT' });
    console.log('[Scheduler] ✅ Frequent sentiment analysis scheduled every 6 hours\n');
    
    return job;
  } catch (error) {
    console.error('[Scheduler] Error scheduling frequent sentiment analysis:', error.message);
  }
};

/**
 * Get all scheduled jobs
 */
const getScheduledJobs = () => {
  return jobs.map(j => ({
    name: j.name,
    schedule: j.schedule,
    timezone: j.timezone,
    active: j.job ? 'yes' : 'no',
  }));
};

/**
 * Stop all scheduled jobs
 */
const stopAllJobs = () => {
  console.log('[Scheduler] Stopping all scheduled jobs...');
  jobs.forEach(j => {
    if (j.job) {
      j.job.stop();
    }
  });
  jobs = [];
  console.log('[Scheduler] All jobs stopped');
};

/**
 * Initialize all scheduled jobs
 */
const initializeScheduledJobs = () => {
  console.log('\n================== INITIALIZING SCHEDULED JOBS ==================');
  
  scheduleDailySentimentAnalysis();
  // Uncomment for more frequent analysis:
  // scheduleFrequentSentimentAnalysis();
  
  console.log('[Scheduler] Active jobs:', getScheduledJobs());
  console.log('================================================================\n');
};

module.exports = {
  initializeScheduledJobs,
  scheduleDailySentimentAnalysis,
  scheduleFrequentSentimentAnalysis,
  getScheduledJobs,
  stopAllJobs,
};
