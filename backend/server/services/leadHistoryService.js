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
    
    // This query gets the most recent sentiment record for each lead for each day in the last N days.
    // We use a generate_series to ensure we have all days represented.
    const res = await query(
      `WITH date_series AS (
         SELECT generate_series(
           current_date - interval '1 day' * ($2 - 1),
           current_date,
           interval '1 day'
         )::date AS day
       ),
       latest_daily_sentiment AS (
         SELECT DISTINCT ON (day, lead_id)
           d.day,
           h.lead_id,
           h.sentiment
         FROM date_series d
         LEFT JOIN lead_sentiment_history h ON h.recorded_at::date <= d.day
         WHERE (h.product_info_id = $1 OR h.product_info_id IS NULL)
         ORDER BY day, lead_id, h.recorded_at DESC
       )
       SELECT 
         to_char(day, 'DD/MM') as name,
         to_char(day, 'YYYY-MM-DD') as "dateStr",
         count(*) FILTER (WHERE sentiment = 'hot') as hot,
         count(*) FILTER (WHERE sentiment = 'warm') as warm,
         count(*) FILTER (WHERE sentiment = 'cold') as cold
       FROM latest_daily_sentiment
       WHERE sentiment IS NOT NULL
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
