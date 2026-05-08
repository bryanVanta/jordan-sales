const { query, hasPostgresConfig } = require('../config/postgres');

/**
 * Lead History Service
 * Handles recording and retrieving historical data for leads, 
 * specifically sentiment/temperature changes for the Sales Insights dashboard.
 */

/**
 * Record a lead's sentiment in the historical database.
 * This should be called whenever a lead's sentiment is updated.
 */
async function recordLeadSentiment(leadId, sentiment, productInfoId = 'current') {
  if (!hasPostgresConfig()) return null;

  try {
    const res = await query(
      `INSERT INTO lead_sentiment_history (lead_id, sentiment, product_info_id)
       VALUES ($1, $2, $3)
       RETURNING id, recorded_at`,
      [leadId, sentiment, productInfoId || 'current']
    );
    return res.rows[0];
  } catch (err) {
    console.error(`[LeadHistory] Failed to record sentiment for lead ${leadId}:`, err.message);
    return null;
  }
}

/**
 * Fetch sentiment trends for a given period (default 30 days).
 * Returns daily counts of hot, warm, and cold leads based on the latest record for each lead on each day.
 */
async function getSentimentTrends(productInfoId = 'current', days = 30) {
  if (!hasPostgresConfig()) return null;

  try {
    const resolvedProductInfoId = productInfoId || 'current';
    
    // Return every day in the requested window. Days before any recorded
    // sentiment stay at zero instead of disappearing from the chart.
    const res = await query(
      `WITH date_series AS (
         SELECT generate_series(
           current_date - interval '1 day' * ($2 - 1),
           current_date,
           interval '1 day'
         )::date AS day
       ),
       relevant_leads AS (
         SELECT DISTINCT lead_id
         FROM lead_sentiment_history
         WHERE (product_info_id = $1 OR product_info_id IS NULL)
       ),
       latest_daily_sentiment AS (
         SELECT
           d.day,
           l.lead_id,
           latest.sentiment
         FROM date_series d
         LEFT JOIN relevant_leads l ON true
         LEFT JOIN LATERAL (
           SELECT h.sentiment
           FROM lead_sentiment_history h
           WHERE h.lead_id = l.lead_id
             AND (h.product_info_id = $1 OR h.product_info_id IS NULL)
             AND h.recorded_at::date <= d.day
           ORDER BY h.recorded_at DESC
           LIMIT 1
         ) latest ON true
       )
       SELECT 
         to_char(day, 'DD/MM') as name,
         to_char(day, 'YYYY-MM-DD') as "dateStr",
         count(*) FILTER (WHERE sentiment = 'hot') as hot,
         count(*) FILTER (WHERE sentiment = 'warm') as warm,
         count(*) FILTER (WHERE sentiment = 'cold') as cold
       FROM latest_daily_sentiment
       GROUP BY day
       ORDER BY day ASC`,
      [resolvedProductInfoId, days]
    );

    return res.rows.map(row => ({
      name: row.name,
      dateStr: row.dateStr,
      hot: parseInt(row.hot, 10) || 0,
      warm: parseInt(row.warm, 10) || 0,
      cold: parseInt(row.cold, 10) || 0
    }));
  } catch (err) {
    console.error(`[LeadHistory] Failed to fetch sentiment trends:`, err.message);
    return null;
  }
}

module.exports = {
  recordLeadSentiment,
  getSentimentTrends,
};
