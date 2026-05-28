import prisma from '../config/prisma.js';

export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
    });
    
    res.json(categories);
  } catch (error) {
    console.error('Помилка отримання категорій:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання категорій' });
  }
};