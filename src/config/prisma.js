import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const { Pool } = pg;

// Створюємо пул підключень до PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ініціалізуємо Prisma адаптер
const adapter = new PrismaPg(pool);

// Створюємо екземпляр PrismaClient з адаптером
const prisma = new PrismaClient({ adapter });

export default prisma;