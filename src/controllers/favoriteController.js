import prisma from '../config/prisma.js';

// 1. Додавання/вилучення оголошення з обраного
export const toggleFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const listingId = parseInt(req.body.listingId, 10);

    if (isNaN(listingId)) {
      return res.status(400).json({ error: 'Недійсний ID оголошення' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    const existing = await prisma.favorite.findUnique({
      where: {
        userId_listingId: {
          userId,
          listingId
        }
      }
    });

    if (existing) {
      await prisma.favorite.delete({
        where: {
          userId_listingId: {
            userId,
            listingId
          }
        }
      });
      return res.json({ message: 'Вилучено з обраного!', saved: false });
    } else {
      await prisma.favorite.create({
        data: {
          userId,
          listingId
        }
      });
      return res.json({ message: 'Збережено в обране!', saved: true });
    }
  } catch (error) {
    console.error('Помилка перемикання обраного:', error);
    res.status(500).json({ error: 'Помилка на сервері при зміні списку обраного' });
  }
};

// 2. Отримання списку обраних оголошень користувача
export const getFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        listing: {
          include: {
            category: true,
            bookings: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            reviews: {
              select: {
                rating: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const listingsWithRatings = favorites.map(fav => {
      const item = fav.listing;
      const reviewCount = item.reviews.length;
      const avgRating = reviewCount > 0
        ? parseFloat((item.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
        : null;

      const { reviews, ...rest } = item;
      return {
        ...rest,
        imageUrl: item.imageUrls[0] || null,
        avgRating,
        reviewCount,
      };
    });

    res.json(listingsWithRatings);
  } catch (error) {
    console.error('Помилка отримання обраного:', error);
    res.status(500).json({ error: 'Помилка на сервері при отриманні обраних оголошень' });
  }
};
