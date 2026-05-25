import prisma from '../config/prisma.js';
import cloudinary from '../config/cloudinary.js';

const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'rentlocal_listings', // Папка у вашому акаунті Cloudinary
        resource_type: 'image',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' } 
          // Автоматичне стиснення, ліміт розміру 1000px та конвертація у WebP/найкращий формат
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url); // Повертаємо безпечне https посилання на фото
      }
    );
    stream.end(fileBuffer);
  });
};

// 1. Отримання всіх оголошень із фільтрацією
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

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        category: true,
        bookings: true,
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

    res.json(listings);
  } catch (error) {
    console.error('Помилка отримання оголошень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання оголошень' });
  }
};

// 2. Створення нового оголошення (тільки для авторизованих користувачів)
export const createListing = async (req, res) => {
  try {
    const { title, description, price, deposit, location, categoryId, latitude, longitude } = req.body;
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
      },
      include: {
        category: true,
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
      message: 'Оголошення успішно створено',
      listing: newListing,
    });
  } catch (error) {
    console.error('Помилка створення оголошення:', error);
    res.status(500).json({ error: 'Помилка на сервері під час створення оголошення' });
  }
};

// 3. Отримання власних оголошень користувача (як власник)
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
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(listings);
  } catch (error) {
    console.error('Помилка отримання власних оголошень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання ваших оголошень' });
  }
};