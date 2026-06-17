import express from 'express';
import { toggleFavorite, getFavorites } from '../controllers/favoriteController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// POST /api/favorites/toggle
router.post('/toggle', toggleFavorite);

// GET /api/favorites
router.get('/', getFavorites);

export default router;
