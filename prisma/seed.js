import 'dotenv/config';
import prisma from '../src/config/prisma.js';

async function main() {
  console.log('Початок додавання категорій...');

  await prisma.category.deleteMany();

  const categories = [
    { name: 'Інструменти', slug: 'tools' },
    { name: 'Електроніка', slug: 'electronics' },
    { name: 'Спорт та відпочинок', slug: 'sport' },
    { name: 'Туризм та кемпінг', slug: 'tourism' },
    { name: 'Транспорт та авто', slug: 'transport' },
    { name: 'Фото та відео техніка', slug: 'photo-video' },
    { name: 'Одяг та аксесуари', slug: 'clothing' },
    { name: 'Дім та сад', slug: 'home-garden' },
    { name: 'Дитячі товари', slug: 'kids' },
    { name: 'Настільні ігри та хобі', slug: 'hobbies' },
    { name: 'Інше', slug: 'other' }, // Додано категорію "Інше"
  ];

  for (const cat of categories) {
    await prisma.category.create({
      data: cat,
    });
  }

  console.log('Категорії успішно додано до бази даних!');
}

main()
  .catch((e) => {
    console.error('Помилка додавання категорій:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });