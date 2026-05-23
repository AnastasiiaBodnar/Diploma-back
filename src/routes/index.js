import express from 'express';
import authRoutes from './authRoutes.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

router.use('/auth', authRoutes);

export default router;