import express from 'express';
import { getListings, createListing, getMyListings } from '../controllers/listingController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// GET /api/listings/my - отримати власні оголошення поточного користувача
router.get('/my', authMiddleware, getMyListings);

// GET /api/listings - отримати всі оголошення (з фільтрацією)
router.get('/', getListings);

// POST /api/listings - створити оголошення (потрібен токен авторизації)
router.post('/', authMiddleware, upload.single('image'), createListing);

export default router;