const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

module.exports = router;
