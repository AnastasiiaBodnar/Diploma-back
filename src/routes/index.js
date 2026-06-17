import express from 'express';
import authRoutes from './authRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import listingRoutes from './listingRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import favoriteRoutes from './favoriteRoutes.js';

const router = express.Router();

router.use('/status', (req, res) => {
  res.json({ status: 'OK', message: 'API is working properly' });
});

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/listings', listingRoutes);
router.use('/bookings', bookingRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/favorites', favoriteRoutes);

export default router;