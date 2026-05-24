import prisma from '../config/prisma.js';

// 1. Отримання всіх оголошень із фільтрацією
export const getListings = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, location } = req.query;
    
    const where = {};

    // Фільтр за категорією
    if (category) {
      if (!isNaN(category)) {
        where.categoryId = parseInt(category, 10);
      } else {
        where.category = {
          slug: category,
        };
      }
    }

    // Пошук за ключовим словом
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Фільтр за ціною
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    // Фільтр за локацією 
    if (location) {
      where.location = { contains: location };
    }

    const listings = await prisma.listing.findMany({
      where,
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
    console.error('Помилка отримання оголошень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання оголошень' });
  }
};

// 2. Створення нового оголошення (тільки для авторизованих користувачів)
export const createListing = async (req, res) => {
  try {
    const { title, description, price, deposit, location, imageUrl, categoryId } = req.body;
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

    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryIdNum },
    });

    if (!categoryExists) {
      return res.status(400).json({ error: 'Вказаної категорії не існує' });
    }

    const newListing = await prisma.listing.create({
      data: {
        title,
        description,
        price: priceNum,
        deposit: depositNum,
        location,
        imageUrl,
        userId,
        categoryId: categoryIdNum,
      },
      include: {
        category: true,
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