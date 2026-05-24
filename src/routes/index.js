import express from 'express';
import authRoutes from './authRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import listingRoutes from './listingRoutes.js';
import bookingRoutes from './bookingRoutes.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/listings', listingRoutes);
router.use('/bookings', bookingRoutes);

export default router;