import express from 'express';
import { createReview, getReviewsByListing } from '../controllers/reviewController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// POST /api/reviews - написати відгук
router.post('/', authMiddleware, createReview);

// GET /api/reviews/listing/:listingId - отримати відгуки для речі
router.get('/listing/:listingId', getReviewsByListing);

export default router;