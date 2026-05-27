import express from 'express';
import { getMyNotifications, markAsRead } from '../controllers/notificationController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/notifications - отримати всі сповіщення користувача
router.get('/', getMyNotifications);

// PATCH /api/notifications/:id/read
router.patch('/:id/read', markAsRead);

export default router;