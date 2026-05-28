import express from 'express';
import { 
  getListings, 
  createListing, 
  getMyListings, 
  deleteListing,
  getListingById,
  updateListing,
  getListingAvailability
} from '../controllers/listingController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// GET /api/listings/my - отримати власні оголошення поточного користувача
router.get('/my', authMiddleware, getMyListings);

// GET /api/listings/:id/availability - отримати зайняті дати оголошення
router.get('/:id/availability', getListingAvailability);

// GET /api/listings/:id - отримати деталі конкретного оголошення за ID
router.get('/:id', getListingById);

// GET /api/listings - отримати всі оголошення (з фільтрацією)
router.get('/', getListings);

// POST /api/listings - створити оголошення
router.post('/', authMiddleware, upload.single('image'), createListing);

// PUT /api/listings/:id - оновити власне оголошення
router.put('/:id', authMiddleware, upload.single('image'), updateListing);

// DELETE /api/listings/:id - видалити власне оголошення
router.delete('/:id', authMiddleware, deleteListing);

export default router;