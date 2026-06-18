import pg from 'pg';
import 'dotenv/config';

const localUrl = process.env.DATABASE_URL || 'postgresql://postgres:4267hj09@localhost:5432/rentlocal';
const remoteUrl = process.argv[2];

if (!remoteUrl) {
  console.error('Помилка: будь ласка, вкажіть URL підключення до Neon як перший аргумент.');
  console.error('Приклад: node migrate-to-neon.js "postgresql://neondb_owner:..."');
  process.exit(1);
}

async function runMigration() {
  console.log('Підключення до локальної бази даних...');
  const localPool = new pg.Pool({ connectionString: localUrl });
  
  console.log('Підключення до віддаленої бази даних Neon...');
  const remotePool = new pg.Pool({ connectionString: remoteUrl });
  
  try {
    // 1. Отримуємо дані з локальної БД
    console.log('Читання локальних даних...');
    
    const categories = (await localPool.query('SELECT * FROM "Category"')).rows;
    const users = (await localPool.query('SELECT * FROM "User"')).rows;
    const listings = (await localPool.query('SELECT * FROM "Listing"')).rows;
    const bookings = (await localPool.query('SELECT * FROM "Booking"')).rows;
    const reviews = (await localPool.query('SELECT * FROM "Review"')).rows;
    const favorites = (await localPool.query('SELECT * FROM "Favorite"')).rows;
    const notifications = (await localPool.query('SELECT * FROM "Notification"')).rows;

    console.log(`Знайдено локально:
      - Категорій: ${categories.length}
      - Користувачів: ${users.length}
      - Оголошень: ${listings.length}
      - Бронювань: ${bookings.length}
      - Відгуків: ${reviews.length}
      - Обраного: ${favorites.length}
      - Сповіщень: ${notifications.length}
    `);

    // 2. Очищуємо віддалені таблиці у правильному порядку (через Foreign Keys)
    console.log('Очищення віддалених таблиць Neon...');
    await remotePool.query('TRUNCATE TABLE "Favorite", "Review", "Notification", "Booking", "Listing", "User", "Category" CASCADE');
    console.log('Віддалені таблиці очищено.');

    // 3. Записуємо категорії
    if (categories.length > 0) {
      console.log('Перенесення категорій...');
      for (const row of categories) {
        await remotePool.query(
          'INSERT INTO "Category" (id, name, slug) VALUES ($1, $2, $3)',
          [row.id, row.name, row.slug]
        );
      }
      await remotePool.query('SELECT setval(\'"Category_id_seq"\', (SELECT MAX(id) FROM "Category"))');
      console.log('Категорії успішно перенесено.');
    }

    // 4. Записуємо користувачів
    if (users.length > 0) {
      console.log('Перенесення користувачів...');
      for (const row of users) {
        await remotePool.query(
          'INSERT INTO "User" (id, email, password, "firstName", "lastName", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [row.id, row.email, row.password, row.firstName, row.lastName, row.createdAt, row.updatedAt]
        );
      }
      await remotePool.query('SELECT setval(\'"User_id_seq"\', (SELECT MAX(id) FROM "User"))');
      console.log('Користувачів успішно перенесено.');
    }

    // 5. Записуємо оголошення
    if (listings.length > 0) {
      console.log('Перенесення оголошень...');
      for (const row of listings) {
        await remotePool.query(
          `INSERT INTO "Listing" (
            id, title, description, price, deposit, location, latitude, longitude, "imageUrls", 
            "createdAt", "updatedAt", "userId", "categoryId", "instantBooking", "checkInTime", "checkOutTime", "brokenUntil"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            row.id, row.title, row.description, row.price, row.deposit, row.location, row.latitude, row.longitude, row.imageUrls,
            row.createdAt, row.updatedAt, row.userId, row.categoryId, row.instantBooking, row.checkInTime, row.checkOutTime, row.brokenUntil
          ]
        );
      }
      await remotePool.query('SELECT setval(\'"Listing_id_seq"\', (SELECT MAX(id) FROM "Listing"))');
      console.log('Оголошення успішно перенесено.');
    }

    // 6. Записуємо бронювання
    if (bookings.length > 0) {
      console.log('Перенесення бронювань...');
      for (const row of bookings) {
        await remotePool.query(
          `INSERT INTO "Booking" (
            id, "listingId", "tenantId", "startDate", "endDate", "totalPrice", status, "createdAt", "updatedAt",
            "tomorrowReminderSent", "endingReminderSent", "overdueReminderSent"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            row.id, row.listingId, row.tenantId, row.startDate, row.endDate, row.totalPrice, row.status, row.createdAt, row.updatedAt,
            row.tomorrowReminderSent, row.endingReminderSent, row.overdueReminderSent
          ]
        );
      }
      await remotePool.query('SELECT setval(\'"Booking_id_seq"\', (SELECT MAX(id) FROM "Booking"))');
      console.log('Бронювання успішно перенесено.');
    }

    // 7. Записуємо відгуки
    if (reviews.length > 0) {
      console.log('Перенесення відгуків...');
      for (const row of reviews) {
        await remotePool.query(
          'INSERT INTO "Review" (id, "listingId", "userId", rating, comment, "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
          [row.id, row.listingId, row.userId, row.rating, row.comment, row.createdAt]
        );
      }
      await remotePool.query('SELECT setval(\'"Review_id_seq"\', (SELECT MAX(id) FROM "Review"))');
      console.log('Відгуки успішно перенесено.');
    }

    // 8. Записуємо обране
    if (favorites.length > 0) {
      console.log('Перенесення обраного...');
      for (const row of favorites) {
        await remotePool.query(
          'INSERT INTO "Favorite" (id, "userId", "listingId", "createdAt") VALUES ($1, $2, $3, $4)',
          [row.id, row.userId, row.listingId, row.createdAt]
        );
      }
      await remotePool.query('SELECT setval(\'"Favorite_id_seq"\', (SELECT MAX(id) FROM "Favorite"))');
      console.log('Обране успішно перенесено.');
    }

    // 9. Записуємо сповіщення
    if (notifications.length > 0) {
      console.log('Перенесення сповіщень...');
      for (const row of notifications) {
        await remotePool.query(
          'INSERT INTO "Notification" (id, "userId", message, type, "isRead", "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
          [row.id, row.userId, row.message, row.type, row.isRead, row.createdAt]
        );
      }
      await remotePool.query('SELECT setval(\'"Notification_id_seq"\', (SELECT MAX(id) FROM "Notification"))');
      console.log('Сповіщення успішно перенесено.');
    }

    console.log('\n==================================================');
    console.log('Ура! Всі дані успішно перенесено на Neon DB!');
    console.log('==================================================');
  } catch (error) {
    console.error('Помилка під час міграції:', error);
  } finally {
    await localPool.end();
    await remotePool.end();
  }
}

runMigration();
