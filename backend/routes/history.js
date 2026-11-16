const express = require('express');
const router = express.Router();
const historyStore = require('../services/historyStore');

// GET /api/history
router.get('/', (req, res) => {
  try {
    const history = historyStore.getHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/history/:jobId
router.delete('/:jobId', (req, res) => {
  try {
    historyStore.removeBuild(req.params.jobId);
    res.json({ success: true, jobId: req.params.jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
