const express = require('express');
const router = express.Router();
const { testPostgresConnection } = require('../config/postgres');

router.get('/health', async (req, res) => {
  try {
    const status = await testPostgresConnection();
    res.status(status.ok ? 200 : 503).json({ success: status.ok, data: status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
