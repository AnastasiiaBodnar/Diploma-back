import prisma from '../config/prisma.js';
import cloudinary from '../config/cloudinary.js';

const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'rentlocal_listings',
        resource_type: 'image',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' } 
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
};

// 1. Отримання всіх оголошень із фільтрацією та рейтингом
export const getListings = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, location } = req.query;
    
    const where = {};

    if (category) {
      if (!isNaN(category)) {
        where.categoryId = parseInt(category, 10);
      } else {
        where.category = {
          slug: category,
        };
      }
    }

    const conditions = [];

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ]
      });
    }

    if (location) {
      const stopWords = new Set(['область', 'обл', 'вулиця', 'вул', 'місто', 'район', 'село', 'смт', 'області']);
      const words = location
        .split(/[\s,]+/)
        .map(w => w.trim().toLowerCase().replace(/[.,]/g, ''))
        .filter(w => w.length >= 3 && !stopWords.has(w));

      if (words.length > 0) {
        conditions.push({
          OR: words.map(word => ({
            location: { contains: word, mode: 'insensitive' }
          }))
        });
      }
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        category: true,
        bookings: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Розраховуємо середній рейтинг та кількість відгуків для кожного оголошення
    const listingsWithRatings = listings.map(item => {
      const reviewCount = item.reviews.length;
      const avgRating = reviewCount > 0
        ? parseFloat((item.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
        : null;

      const { reviews, ...rest } = item;
      return {
        ...rest,
        avgRating,
        reviewCount,
      };
    });

    res.json(listingsWithRatings);
  } catch (error) {
    console.error('Помилка отримання оголошень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання оголошень' });
  }
};

// 2. Створення нового оголошення (тільки для авторизованих користувачів)
export const createListing = async (req, res) => {
  try {
    const { title, description, price, deposit, location, categoryId, latitude, longitude, instantBooking } = req.body;
    const userId = req.user.userId;

    if (!title || !description || price === undefined || deposit === undefined || !location || !categoryId) {
      return res.status(400).json({ error: 'Усі обов’язкові поля мають бути заповнені' });
    }

    const priceNum = parseFloat(price);
    const depositNum = parseFloat(deposit);
    const categoryIdNum = parseInt(categoryId, 10);

    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Ціна повинна бути додатним числом' });
    }

    if (isNaN(depositNum) || depositNum < 0) {
      return res.status(400).json({ error: 'Завдаток повинен бути додатним числом' });
    }

    //Перетворюємо координати у Float, якщо вони передані, або записуємо null
    const latitudeNum = latitude ? parseFloat(latitude) : null;
    const longitudeNum = longitude ? parseFloat(longitude) : null;

    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryIdNum },
    });

    if (!categoryExists) {
      return res.status(400).json({ error: 'Вказаної категорії не існує' });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer);
      } catch (uploadError) {
        console.error('Помилка завантаження фото в Cloudinary:', uploadError);
        return res.status(500).json({ error: 'Не вдалося завантажити зображення на хмарний сервер' });
      }
    }

    const newListing = await prisma.listing.create({
      data: {
        title,
        description,
        price: priceNum,
        deposit: depositNum,
        location,
        latitude: latitudeNum, // Зберігаємо широту
        longitude: longitudeNum, // Зберігаємо довготу
        imageUrl,
        userId,
        categoryId: categoryIdNum,
        instantBooking: instantBooking === 'true' || instantBooking === true,
      },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Оголошення успішно створено',
      listing: newListing,
    });
  } catch (error) {
    console.error('Помилка створення оголошення:', error);
    res.status(500).json({ error: 'Помилка на сервері під час створення оголошення' });
  }
};

// 3. Отримання власних оголошень користувача із рейтингом
export const getMyListings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const listings = await prisma.listing.findMany({
      where: { userId },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const listingsWithRatings = listings.map(item => {
      const reviewCount = item.reviews.length;
      const avgRating = reviewCount > 0
        ? parseFloat((item.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
        : null;

      const { reviews, ...rest } = item;
      return {
        ...rest,
        avgRating,
        reviewCount,
      };
    });

    res.json(listingsWithRatings);
  } catch (error) {
    console.error('Помилка отримання власних оголошень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання ваших оголошень' });
  }
};

// 4. Видалення власного оголошення
export const deleteListing = async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(idNum)) {
      return res.status(400).json({ error: 'Некоректний ID оголошення' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: idNum },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    if (listing.userId !== userId) {
      return res.status(403).json({ error: 'Ви не маєте прав на видалення цього оголошення' });
    }

    await prisma.booking.deleteMany({
      where: { listingId: idNum },
    });

    await prisma.listing.delete({
      where: { id: idNum },
    });

    res.json({ message: 'Оголошення успішно видалено' });
  } catch (error) {
    console.error('Помилка видалення оголошення:', error);
    res.status(500).json({ error: 'Помилка на сервері під час видалення оголошення' });
  }
};

// 5. Отримання оголошення за ID (разом із детальними відгуками та рейтингом)
export const getListingById = async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    if (isNaN(idNum)) {
      return res.status(400).json({ error: 'Некоректний ID оголошення' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: idNum },
      include: {
        category: true,
        bookings: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    const reviewCount = listing.reviews.length;
    const avgRating = reviewCount > 0
      ? parseFloat((listing.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
      : null;

    // Розрахунок загального рейтингу власника (середнє по всіх його речах)
    const ownerListings = await prisma.listing.findMany({
      where: { userId: listing.userId },
      include: {
        reviews: {
          select: { rating: true }
        }
      }
    });

    const ownerReviews = ownerListings.flatMap(l => l.reviews);
    const ownerReviewCount = ownerReviews.length;
    const ownerAvgRating = ownerReviewCount > 0
      ? parseFloat((ownerReviews.reduce((sum, r) => sum + r.rating, 0) / ownerReviewCount).toFixed(1))
      : null;

    res.json({
      ...listing,
      avgRating,
      reviewCount,
      user: {
        ...listing.user,
        ownerAvgRating,
        ownerReviewCount
      }
    });
  } catch (error) {
    console.error('Помилка отримання оголошення за ID:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання деталей оголошення' });
  }
};

// 6. Оновлення оголошення за ID
export const updateListing = async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(idNum)) {
      return res.status(400).json({ error: 'Некоректний ID оголошення' });
    }

    // Перевірка існування оголошення та прав власності
    const existingListing = await prisma.listing.findUnique({
      where: { id: idNum },
    });

    if (!existingListing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    if (existingListing.userId !== userId) {
      return res.status(403).json({ error: 'Ви не маєте прав на редагування цього оголошення' });
    }

    const { title, description, price, deposit, location, categoryId, latitude, longitude, instantBooking } = req.body;

    const updateData = {};

    if (location !== undefined) updateData.location = location;

    if (instantBooking !== undefined) {
      updateData.instantBooking = instantBooking === 'true' || instantBooking === true;
    }

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Ціна повинна бути додатним числом' });
      }
      updateData.price = priceNum;
    }

    if (deposit !== undefined) {
      const depositNum = parseFloat(deposit);
      if (isNaN(depositNum) || depositNum < 0) {
        return res.status(400).json({ error: 'Завдаток повинен бути додатним числом' });
      }
      updateData.deposit = depositNum;
    }

    if (location !== undefined) updateData.location = location;

    if (latitude !== undefined) {
      updateData.latitude = latitude ? parseFloat(latitude) : null;
    }
    if (longitude !== undefined) {
      updateData.longitude = longitude ? parseFloat(longitude) : null;
    }

    if (categoryId !== undefined) {
      const categoryIdNum = parseInt(categoryId, 10);
      if (isNaN(categoryIdNum)) {
        return res.status(400).json({ error: 'Некоректний ID категорії' });
      }

      const categoryExists = await prisma.category.findUnique({
        where: { id: categoryIdNum },
      });

      if (!categoryExists) {
        return res.status(400).json({ error: 'Вказаної категорії не існує' });
      }
      updateData.categoryId = categoryIdNum;
    }
    
    if (req.file) {
      try {
        const imageUrl = await uploadToCloudinary(req.file.buffer);
        updateData.imageUrl = imageUrl;
      } catch (uploadError) {
        console.error('Помилка завантаження фото в Cloudinary:', uploadError);
        return res.status(500).json({ error: 'Не вдалося завантажити нове зображення' });
      }
    }

    const updatedListing = await prisma.listing.update({
      where: { id: idNum },
      data: updateData,
      include: {
        category: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    res.json({
      message: 'Оголошення успішно оновлено',
      listing: updatedListing,
    });
  } catch (error) {
    console.error('Помилка оновлення оголошення:', error);
    res.status(500).json({ error: 'Помилка на сервері під час оновлення оголошення' });
  }
};

// 7. Отримання календаря зайнятості оголошення (зайняті дати)
export const getListingAvailability = async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    if (isNaN(idNum)) {
      return res.status(400).json({ error: 'Некоректний ID оголошення' });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        listingId: idNum,
        status: 'CONFIRMED',
        endDate: {
          gte: new Date(),
        },
      },
      select: {
        startDate: true,
        endDate: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    res.json(bookings);
  } catch (error) {
    console.error('Помилка отримання зайнятих дат:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання календаря зайнятості' });
  }
};