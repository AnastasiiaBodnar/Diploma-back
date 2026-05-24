import express from 'express';
import {
  createBooking,
  getMyRentals,
  getMyRequests,
  updateBookingStatus,
} from '../controllers/bookingController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// Усі маршрути бронювань потребують обов'язкової авторизації!
router.use(authMiddleware);

// POST /api/bookings - зробити запит на оренду
router.post('/', createBooking);

// GET /api/bookings/my-rentals - список речей, які я орендував (як орендар)
router.get('/my-rentals', getMyRentals);

// GET /api/bookings/my-requests - список запитів на мої речі (як орендодавець)
router.get('/my-requests', getMyRequests);

// PATCH /api/bookings/:id/status - підтвердити/відхилити запит (для власника) або скасувати (для орендаря)
router.patch('/:id/status', updateBookingStatus);

export default router;