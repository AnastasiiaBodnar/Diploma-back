const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');

router.get('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

router.use('/auth', authRoutes);

module.exports = router;
