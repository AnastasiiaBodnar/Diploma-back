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
      include: {
        user: {
          select: { name: true }
        }
      }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    // Отримуємо ім'я орендаря (для створення гарного сповіщення)
    const tenantUser = await prisma.user.findUnique({
      where: { id: tenantId },
      select: { name: true }
    });

    const isOwner = listing.userId === tenantId;

    // ПЕРЕВІРКА НА НАКЛАДАННЯ ДАТ (чи не зайнята річ)
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

    // Розрахунок вартості
    const timeDiff = end.getTime() - start.getTime();
    const days = Math.ceil(timeDiff / (1000 * 3600 * 24));

    const totalPrice = isOwner ? 0 : (listing.price * days) + listing.deposit;

    // Визначаємо стартовий статус
    let initialStatus = 'PENDING';
    if (isOwner || listing.instantBooking) {
      initialStatus = 'CONFIRMED';
    }

    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        tenantId,
        startDate: start,
        endDate: end,
        totalPrice,
        status: initialStatus,
      },
      include: {
        listing: true,
      },
    });

    // Форматування дат для тексту сповіщення
    const dateStr = `${start.toLocaleDateString('uk-UA')} - ${end.toLocaleDateString('uk-UA')}`;

    // --- Створення сповіщень ---
    if (isOwner) {
      await prisma.notification.create({
        data: {
          userId: tenantId,
          type: 'OWNER_RESERVED',
          message: `Ви успішно забронювали свій інструмент "${listing.title}" на період ${dateStr} для власних потреб.`
        }
      });
    } else if (listing.instantBooking) {

      await prisma.notification.create({
        data: {
          userId: tenantId,
          type: 'BOOKING_CONFIRMED',
          message: `Ваше бронювання інструменту "${listing.title}" на ${dateStr} успішно підтверджено миттєво!`
        }
      });

      await prisma.notification.create({
        data: {
          userId: listing.userId,
          type: 'BOOKING_INSTANT',
          message: `Користувач ${tenantUser.name || 'Орендар'} миттєво забронював ваш інструмент "${listing.title}" на період ${dateStr}.`
        }
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: tenantId,
          type: 'BOOKING_REQUEST_SENT',
          message: `Ваш запит на оренду "${listing.title}" на період ${dateStr} надіслано власнику. Очікуйте на підтвердження.`
        }
      });

      await prisma.notification.create({
        data: {
          userId: listing.userId,
          type: 'BOOKING_REQUEST_RECEIVED',
          message: `Новий запит на оренду "${listing.title}" від ${tenantUser.name || 'користувача'} на дати ${dateStr}.`
        }
      });
    }

    res.status(201).json({
      message: isOwner 
        ? 'Дати успішно заблоковано для власних потреб' 
        : (listing.instantBooking ? 'Бронювання успішно підтверджено' : 'Запит на оренду надіслано'),
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

// 4. Керування статусом бронювання (підтвердження/відхилення/скасування)
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body; // Очікуємо CONFIRMED, REJECTED або CANCELLED та опціональну причину
    const currentUserId = req.user.userId;

    if (!['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'Недійсний статус бронювання' });
    }

    // Знаходимо бронювання
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id, 10) },
      include: { 
        listing: true,
        tenant: { select: { name: true } }
      },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Бронювання не знайдено' });
    }

    const isTenant = booking.tenantId === currentUserId;
    const isOwner = booking.listing.userId === currentUserId;

    if (status === 'CANCELLED') {
      // Скасувати можуть обоє (орендар або власник через форс-мажор)
      if (!isTenant && !isOwner) {
        return res.status(403).json({ error: 'Ви не маєте прав на скасування цього бронювання' });
      }
    } else {
      // Підтвердити/відхилити запит може тільки власник
      if (!isOwner) {
        return res.status(403).json({ error: 'Тільки власник речі може підтвердити або відхилити запит' });
      }
    }

    // Оновлюємо статус
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: { status },
    });

    const dateStr = `${booking.startDate.toLocaleDateString('uk-UA')} - ${booking.endDate.toLocaleDateString('uk-UA')}`;

    // --- Надсилання сповіщень залежно від нового статусу ---
    if (status === 'CONFIRMED') {
      // Власник схвалив
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_APPROVED',
          message: `Чудова новина! Власник підтвердив ваше бронювання інструменту "${booking.listing.title}" на період ${dateStr}.`
        }
      });
    } else if (status === 'REJECTED') {
      // Власник відхилив
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_REJECTED',
          message: `На жаль, власник відхилив ваш запит на оренду інструменту "${booking.listing.title}" на дати ${dateStr}.`
        }
      });
    } else if (status === 'CANCELLED') {
      if (isTenant) {
        // Орендар сам скасував
        await prisma.notification.create({
          data: {
            userId: booking.listing.userId,
            type: 'BOOKING_CANCELLED_BY_TENANT',
            message: `Користувач ${booking.tenant.name || 'Орендар'} скасував своє бронювання інструменту "${booking.listing.title}" на дати ${dateStr}.`
          }
        });
      } else if (isOwner) {
        // Власник скасував (форс-мажор, поломка)
        const cancellationMessage = `Увага! Власник був змушений скасувати ваше бронювання інструменту "${booking.listing.title}" на дати ${dateStr}. Причина: ${reason || 'непередбачувані технічні обставини (наприклад, поломка)'}.`;
        
        await prisma.notification.create({
          data: {
            userId: booking.tenantId,
            type: 'BOOKING_CANCELLED_BY_OWNER',
            message: cancellationMessage
          }
        });
      }
    }

    res.json({
      message: `Статус бронювання успішно змінено на ${status}`,
      booking: updatedBooking,
    });
  } catch (error) {
    console.error('Помилка оновлення статусу бронювання:', error);
    res.status(500).json({ error: 'Помилка на сервері під час оновлення статусу' });
  }
};