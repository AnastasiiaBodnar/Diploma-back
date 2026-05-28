import prisma from '../config/prisma.js';

// 1. Створення відгуку
export const createReview = async (req, res) => {
  try {
    const { listingId, rating, comment } = req.body;
    const userId = req.user.userId;

    if (!listingId || !rating || !comment) {
      return res.status(400).json({ error: 'Будь ласка, вкажіть ID речі, оцінку та коментар' });
    }

    const listingIdNum = parseInt(listingId, 10);
    const ratingNum = parseInt(rating, 10);

    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Оцінка повинна бути цілим числом від 1 до 5' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingIdNum },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    if (listing.userId === userId) {
      return res.status(400).json({ error: 'Ви не можете залишати відгук на власну річ' });
    }

    // Перевірка: чи орендував користувач цю річ раніше (статус CONFIRMED)
    const existingBooking = await prisma.booking.findFirst({
      where: {
        listingId: listingIdNum,
        tenantId: userId,
        status: 'CONFIRMED',
      },
    });

    if (!existingBooking) {
      return res.status(403).json({ 
        error: 'Ви можете залишити відгук тільки після успішної оренди цієї речі' 
      });
    }

    // Перевірка: чи не залишав цей користувач вже відгук на цей товар (1 відгук на річ)
    const existingReview = await prisma.review.findFirst({
      where: {
        listingId: listingIdNum,
        userId: userId,
      },
    });

    if (existingReview) {
      return res.status(400).json({ error: 'Ви вже залишили відгук для цієї речі' });
    }

    const review = await prisma.review.create({
      data: {
        listingId: listingIdNum,
        userId,
        rating: ratingNum,
        comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Відгук успішно додано!',
      review,
    });
  } catch (error) {
    console.error('Помилка створення відгуку:', error);
    res.status(500).json({ error: 'Помилка на сервері під час додавання відгуку' });
  }
};

// 2. Отримання всіх відгуків для конкретного оголошення
export const getReviewsByListing = async (req, res) => {
  try {
    const listingIdNum = parseInt(req.params.listingId, 10);
    if (isNaN(listingIdNum)) {
      return res.status(400).json({ error: 'Некоректний ID оголошення' });
    }

    const reviews = await prisma.review.findMany({
      where: { listingId: listingIdNum },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(reviews);
  } catch (error) {
    console.error('Помилка отримання відгуків:', error);
    res.status(500).json({ error: 'Помилка на сервері під час завантаження відгуків' });
  }
};