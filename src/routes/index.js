import express from 'express';
import authRoutes from './authRoutes.js';
import categoryRoutes from './categoryRoutes.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);

export default router;