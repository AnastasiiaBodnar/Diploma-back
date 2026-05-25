import prisma from '../config/prisma.js';

// 1. Створення нового бронювання (запиту на оренду)
export const createBooking = async (req, res) => {
  try {
    const { listingId, startDate, endDate } = req.body;
    const tenantId = req.user.userId; // Хто бронює

    if (!listingId || !startDate || !endDate) {
      return res.status(400).json({ error: 'listingId, startDate та endDate є обов’язковими' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Обнуляємо час для коректного порівняння дат

    // Валідація дат
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Некоректний формат дат' });
    }

    if (start < today) {
      return res.status(400).json({ error: 'Дата початку оренди не може бути в минулому' });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'Дата завершення оренди повинна бути після дати початку' });
    }

    // Перевірка існування оголошення
    const listing = await prisma.listing.findUnique({
      where: { id: parseInt(listingId, 10) },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    // Власник не може орендувати власну річ
    if (listing.userId === tenantId) {
      return res.status(400).json({ error: 'Ви не можете орендувати власну річ' });
    }

    // ПЕРЕВІРКА НА НАКЛАДАННЯ ДАТ (чи не зайнята річ)
    // Два інтервали [A, B] та [C, D] перетинаються, якщо (A <= D) та (B >= C)
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        listingId: listing.id,
        status: 'CONFIRMED',
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
    });

    if (conflictingBooking) {
      return res.status(400).json({ error: 'Цей предмет уже заброньовано на вказані дати' });
    }

    // Розрахунок загальної вартості (оренда за всі дні + застава)
    const timeDiff = end.getTime() - start.getTime();
    const days = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const totalPrice = (listing.price * days) + listing.deposit;

    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        tenantId,
        startDate: start,
        endDate: end,
        totalPrice,
        status: 'PENDING', // За замовчуванням очікує підтвердження
      },
      include: {
        listing: true,
      },
    });

    res.status(201).json({
      message: 'Запит на бронювання успішно надіслано',
      booking,
    });
  } catch (error) {
    console.error('Помилка створення бронювання:', error);
    res.status(500).json({ error: 'Помилка на сервері під час бронювання' });
  }
};

// 2. Отримання списку моїх оренд (як орендар)
export const getMyRentals = async (req, res) => {
  try {
    const tenantId = req.user.userId;

    const rentals = await prisma.booking.findMany({
      where: { tenantId },
      include: {
        listing: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rentals);
  } catch (error) {
    console.error('Помилка отримання оренд:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання ваших оренд' });
  }
};

// 3. Отримання запитів від інших користувачів на мої речі (як власник)
export const getMyRequests = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    const requests = await prisma.booking.findMany({
      where: {
        listing: {
          userId: ownerId,
        },
      },
      include: {
        listing: true,
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  } catch (error) {
    console.error('Помилка отримання запитів:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання запитів' });
  }
};

// 4. Керування статусом бронювання (підтвердження/відхилення власником речі)
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Очікуємо CONFIRMED або REJECTED
    const ownerId = req.user.userId;

    if (!['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'Недійсний статус бронювання' });
    }

    // Знаходимо бронювання та перевіряємо, чи належить річ орендодавцю
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id, 10) },
      include: { listing: true },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Бронювання не знайдено' });
    }

    // Зміна статусу дозволена тільки власнику речі (або орендарю, якщо він скасовує CANCELLED)
    if (status === 'CANCELLED') {
      if (booking.tenantId !== ownerId) {
        return res.status(403).json({ error: 'Ви можете скасувати тільки власне бронювання' });
      }
    } else {
      if (booking.listing.userId !== ownerId) {
        return res.status(403).json({ error: 'Тільки власник речі може підтвердити або відхилити запит' });
      }
    }

    // Оновлюємо статус
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: { status },
    });

    res.json({
      message: `Статус бронювання успішно змінено на ${status}`,
      booking: updatedBooking,
    });
  } 
  
  catch (error) {
    console.error('Помилка оновлення статусу бронювання:', error);
    res.status(500).json({ error: 'Помилка на сервері під час оновлення статусу' });
  }
};