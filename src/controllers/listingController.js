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

    // Ховаємо зламані товари, у яких термін ремонту ще не минув
    const now = new Date();
    conditions.push({
      OR: [
        { brokenUntil: null },
        { brokenUntil: { lt: now } }
      ]
    });

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
        imageUrl: item.imageUrls[0] || null,
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
    const { title, description, price, deposit, location, categoryId, latitude, longitude, instantBooking, checkInTime, checkOutTime } = req.body;
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

    if (!req.files || req.files.length < 2 || req.files.length > 3) {
      return res.status(400).json({ error: 'Вам необхідно завантажити 2 або 3 обов’язкові фотографії' });
    }

    let imageUrls = [];
    try {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      imageUrls = await Promise.all(uploadPromises);
    } catch (uploadError) {
      console.error('Помилка завантаження фото в Cloudinary:', uploadError);
      return res.status(500).json({ error: 'Не вдалося завантажити зображення на хмарний сервер' });
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
        imageUrls,
        userId,
        categoryId: categoryIdNum,
        instantBooking: instantBooking === 'true' || instantBooking === true,
        checkInTime: checkInTime || '14:00',
        checkOutTime: checkOutTime || '12:00',
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

    const listingWithCompat = {
      ...newListing,
      imageUrl: newListing.imageUrls[0] || null
    };

    res.status(201).json({
      message: 'Оголошення успішно створено',
      listing: listingWithCompat,
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
        imageUrl: item.imageUrls[0] || null,
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
      imageUrl: listing.imageUrls[0] || null,
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

    const { title, description, price, deposit, location, categoryId, latitude, longitude, instantBooking, checkInTime, checkOutTime } = req.body;

    const updateData = {};

    if (checkInTime !== undefined) updateData.checkInTime = checkInTime;
    if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime;

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
    
    if (req.files && req.files.length > 0) {
      if (req.files.length < 2 || req.files.length > 3) {
        return res.status(400).json({ error: 'При оновленні фотографій вам необхідно завантажити 2 або 3 обов’язкові фотографії' });
      }
      try {
        const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
        const imageUrls = await Promise.all(uploadPromises);
        updateData.imageUrls = imageUrls;
      } catch (uploadError) {
        console.error('Помилка завантаження фото в Cloudinary:', uploadError);
        return res.status(500).json({ error: 'Не вдалося завантажити нові зображення' });
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

    const listingWithCompat = {
      ...updatedListing,
      imageUrl: updatedListing.imageUrls[0] || null
    };

    res.json({
      message: 'Оголошення успішно оновлено',
      listing: listingWithCompat,
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

    const listing = await prisma.listing.findUnique({
      where: { id: idNum },
      select: { brokenUntil: true }
    });

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

    const availability = [...bookings];
    if (listing && listing.brokenUntil && new Date(listing.brokenUntil) > new Date()) {
      availability.push({
        startDate: new Date(),
        endDate: listing.brokenUntil
      });
    }

    res.json(availability);
  } catch (error) {
    console.error('Помилка отримання зайнятих дат:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання календаря зайнятості' });
  }
};

// 8. Повідомлення про те, що товар зламався (власник)
export const reportBroken = async (req, res) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    const userId = req.user.userId;
    const { untilDate, reason } = req.body;

    if (isNaN(listingId)) {
      return res.status(400).json({ error: 'Недійсний ID оголошення' });
    }

    if (!untilDate) {
      return res.status(400).json({ error: 'Необхідно вказати дату, до якої товар буде в ремонті' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    if (listing.userId !== userId) {
      return res.status(403).json({ error: 'Немає доступу. Ви не є власником цього оголошення' });
    }

    const brokenUntilDate = new Date(untilDate);
    if (isNaN(brokenUntilDate.getTime())) {
      return res.status(400).json({ error: 'Невірний формат дати' });
    }

    // Оновлюємо статус оголошення (brokenUntil)
    await prisma.listing.update({
      where: { id: listingId },
      data: { brokenUntil: brokenUntilDate }
    });

    // Шукаємо активні (PENDING або CONFIRMED) бронювання для цього оголошення,
    // які перетинаються з періодом ремонту (починаються під час або до ремонту)
    const bookings = await prisma.booking.findMany({
      where: {
        listingId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { lte: brokenUntilDate },
        endDate: { gte: new Date() }
      }
    });

    let cancelledCount = 0;

    for (const booking of bookings) {
      // Оновлюємо статус бронювання на CANCELLED
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' }
      });

      // Надсилаємо сповіщення орендарю
      const formattedUntilDate = brokenUntilDate.toLocaleDateString('uk-UA');
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'ITEM_BROKEN',
          message: `Оренда речі "${listing.title}" скасована власником через поломку товару. Причина: "${reason || 'технічні причини'}". (Очікуваний термін ремонту до ${formattedUntilDate}).`
        }
      });

      cancelledCount++;
    }

    res.json({
      message: `Товар позначено як зламаний до ${brokenUntilDate.toLocaleDateString('uk-UA')}. Скасовано ${cancelledCount} бронювань, а користувачів сповіщено.`,
      cancelledCount
    });
  } catch (error) {
    console.error('Помилка маркування товару як зламаного:', error);
    res.status(500).json({ error: 'Помилка на сервері під час маркування товару як зламаного' });
  }
};

// 9. Позначення товару як справного / завершення ремонту (власник)
export const resolveBroken = async (req, res) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(listingId)) {
      return res.status(400).json({ error: 'Недійсний ID оголошення' });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    if (listing.userId !== userId) {
      return res.status(403).json({ error: 'Немає доступу. Ви не є власником цього оголошення' });
    }

    // Оновлюємо статус оголошення (brokenUntil: null)
    await prisma.listing.update({
      where: { id: listingId },
      data: { brokenUntil: null }
    });

    res.json({
      message: 'Товар успішно позначено як справний. Його знову видно в каталозі!'
    });
  } catch (error) {
    console.error('Помилка маркування товару як справного:', error);
    res.status(500).json({ error: 'Помилка на сервері під час маркування товару як справного' });
  }
};