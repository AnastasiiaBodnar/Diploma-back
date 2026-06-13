import prisma from '../config/prisma.js';
import { sendEmail } from '../services/emailService.js';

// 1. Створення нового бронювання (запиту на оренду)
export const createBooking = async (req, res) => {
  try {
    const { listingId, startDate, endDate } = req.body;
    const tenantId = req.user.userId; // Хто бронює

    if (!listingId || !startDate || !endDate) {
      return res.status(400).json({ error: 'listingId, startDate та endDate є обов’язковими' });
    }

    // Спочатку шукаємо оголошення, щоб отримати налаштований час
    const listing = await prisma.listing.findUnique({
      where: { id: parseInt(listingId, 10) },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Оголошення не знайдено' });
    }

    // Визначаємо час отримання (Check-in) та повернення (Check-out)
    const checkInTime = listing.checkInTime || '14:00';
    const checkOutTime = listing.checkOutTime || '12:00';

    const start = new Date(`${startDate}T${checkInTime}:00`);
    const end = new Date(`${endDate}T${checkOutTime}:00`);

    // Валідація дат
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Некоректний формат дат' });
    }

    if (start < new Date()) {
      return res.status(400).json({ error: 'Дата та час початку оренди не можуть бути в минулому' });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'Дата завершення оренди повинна бути після дати початку' });
    }

    // Отримуємо дані орендаря
    const tenantUser = await prisma.user.findUnique({
      where: { id: tenantId },
      select: { firstName: true, lastName: true, email: true }
    });

    const tenantFullName = tenantUser ? `${tenantUser.firstName || ''} ${tenantUser.lastName || ''}`.trim() : 'Орендар';
    const tenantEmail = tenantUser?.email;
    const ownerEmail = listing.user?.email;

    const isOwner = listing.userId === tenantId;

    // Розрахунок вартості
    const timeDiff = end.getTime() - start.getTime();
    const days = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const totalPrice = isOwner ? 0 : (listing.price * days) + listing.deposit;

    // Визначаємо стартовий статус
    let initialStatus = 'PENDING';
    if (isOwner || listing.instantBooking) {
      initialStatus = 'CONFIRMED';
    }

    // ТРАНЗАКЦІЯ З БЛОКУВАННЯМ РЯДКА
    let booking;
    try {
      booking = await prisma.$transaction(async (tx) => {
        // Блокуємо рядок оголошення для запобігання паралельним транзакціям
        await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${listing.id} FOR UPDATE`;

        // Перевірка на накладання дат за допомогою строгих нерівностей (lt та gt)
        const conflictingBooking = await tx.booking.findFirst({
          where: {
            listingId: listing.id,
            status: 'CONFIRMED',
            AND: [
              { startDate: { lt: end } },
              { endDate: { gt: start } },
            ],
          },
        });

        if (conflictingBooking) {
          throw new Error('ConflictingBooking');
        }

        return await tx.booking.create({
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
      });
    } catch (txError) {
      if (txError.message === 'ConflictingBooking') {
        return res.status(400).json({ error: 'Цей предмет уже заброньовано на вказані дати' });
      }
      throw txError;
    }

    const dateStr = `${start.toLocaleDateString('uk-UA')} - ${end.toLocaleDateString('uk-UA')}`;

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
          message: `Користувач ${tenantFullName} миттєво забронював ваш інструмент "${listing.title}" на період ${dateStr}.`
        }
      });

      // Email орендарю
      if (tenantEmail) {
        await sendEmail({
          to: tenantEmail,
          subject: `Підтвердження бронювання: ${listing.title}`,
          html: `<h2>Вітаємо, ${tenantUser.firstName}!</h2>
                 <p>Ваше миттєве бронювання речі <strong>"${listing.title}"</strong> успішно підтверджено.</p>
                 <p><strong>Період:</strong> ${dateStr}</p>
                 <p><strong>Сума до сплати (з заставою):</strong> ${totalPrice} грн</p>
                 <p>Зв'яжіться з власником для отримання речі.</p>`
        });
      }

      // Email власнику
      if (ownerEmail) {
        await sendEmail({
          to: ownerEmail,
          subject: `Миттєве бронювання вашої речі: ${listing.title}`,
          html: `<h2>Вітаємо!</h2>
                 <p>Користувач <strong>${tenantFullName}</strong> миттєво забронював вашу річ <strong>"${listing.title}"</strong>.</p>
                 <p><strong>Період:</strong> ${dateStr}</p>
                 <p><strong>Ваш заробіток (без застави):</strong> ${totalPrice - listing.deposit} грн</p>
                 <p>Зв'яжіться з орендарем (${tenantEmail}) для передачі речі.</p>`
        });
      }
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
          message: `Новий запит на оренду "${listing.title}" від ${tenantFullName} на дати ${dateStr}.`
        }
      });

      // Email орендарю
      if (tenantEmail) {
        await sendEmail({
          to: tenantEmail,
          subject: `Запит на оренду надіслано: ${listing.title}`,
          html: `<h2>Привіт, ${tenantUser.firstName}!</h2>
                 <p>Ваш запит на оренду речі <strong>"${listing.title}"</strong> успішно надіслано власнику.</p>
                 <p><strong>Період:</strong> ${dateStr}</p>
                 <p>Очікуйте на підтвердження від власника протягом 24 годин.</p>`
        });
      }

      // Email власнику
      if (ownerEmail) {
        await sendEmail({
          to: ownerEmail,
          subject: `Новий запит на оренду: ${listing.title}`,
          html: `<h2>Привіт!</h2>
                 <p>Користувач <strong>${tenantFullName}</strong> надіслав запит на оренду вашої речі <strong>"${listing.title}"</strong>.</p>
                 <p><strong>Період:</strong> ${dateStr}</p>
                 <p>Будь ласка, підтвердіть або відхиліть цей запит у вашому кабінеті протягом 24 годин.</p>`
        });
      }
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
            firstName: true,
            lastName: true,
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

// 4. Керування статусом бронювання (підтвердження/відхилення/скасування/завершення)
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const currentUserId = req.user.userId;

    if (!['CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ error: 'Недійсний статус бронювання' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id, 10) },
      include: { 
        listing: {
          include: {
            user: { select: { email: true, firstName: true } }
          }
        },
        tenant: { select: { firstName: true, lastName: true, email: true } }
      },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Бронювання не знайдено' });
    }

    const isTenant = booking.tenantId === currentUserId;
    const isOwner = booking.listing.userId === currentUserId;

    if (status === 'CANCELLED') {
      if (!isTenant && !isOwner) {
        return res.status(403).json({ error: 'Ви не маєте прав на скасування цього бронювання' });
      }
    } else if (status === 'COMPLETED') {
      // Тільки власник може підтвердити, що річ повернулася
      if (!isOwner) {
        return res.status(403).json({ error: 'Тільки власник речі може підтвердити її повернення' });
      }
      if (booking.status !== 'CONFIRMED') {
        return res.status(400).json({ error: 'Можна завершити тільки підтверджене бронювання' });
      }
    } else {
      // Підтвердити/відхилити запит (CONFIRMED/REJECTED) може тільки власник
      if (!isOwner) {
        return res.status(403).json({ error: 'Тільки власник речі може оновити цей статус' });
      }
    }

    const dateStr = `${booking.startDate.toLocaleDateString('uk-UA')} - ${booking.endDate.toLocaleDateString('uk-UA')}`;
    const tenantEmail = booking.tenant?.email;
    const ownerEmail = booking.listing.user?.email;
    const tenantFullName = booking.tenant ? `${booking.tenant.firstName || ''} ${booking.tenant.lastName || ''}`.trim() : 'Орендар';

    let updatedBooking;

    // ОБРОБКА СТАТУСУ CONFIRMED З ТРАНЗАКЦІЄЮ ТА БЛОКУВАННЯМ РЯДКА
    if (status === 'CONFIRMED') {
      try {
        updatedBooking = await prisma.$transaction(async (tx) => {
          // Блокуємо оголошення за допомогою FOR UPDATE
          await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${booking.listingId} FOR UPDATE`;

          // Перевіряємо, чи немає вже підтвердженого замовлення на ці дати
          const conflictingBooking = await tx.booking.findFirst({
            where: {
              listingId: booking.listingId,
              status: 'CONFIRMED',
              id: { not: booking.id }, // крім поточного запиту
              AND: [
                { startDate: { lt: booking.endDate } },
                { endDate: { gt: booking.startDate } },
              ],
            },
          });

          if (conflictingBooking) {
            throw new Error('ConflictingBooking');
          }

          // Оновлюємо статус запиту на CONFIRMED
          return await tx.booking.update({
            where: { id: booking.id },
            data: { status },
          });
        });
      } catch (txError) {
        if (txError.message === 'ConflictingBooking') {
          return res.status(400).json({ error: 'Не вдалося підтвердити, оскільки цей предмет уже заброньовано іншим користувачем на ці дати.' });
        }
        throw txError;
      }
    } else {
      // Для інших статусів (REJECTED, CANCELLED, COMPLETED) просто оновлюємо статус
      updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: { status },
      });
    }

    if (status === 'CONFIRMED') {
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_APPROVED',
          message: `Чудова новина! Власник підтвердив ваше бронювання інструменту "${booking.listing.title}" на період ${dateStr}.`
        }
      });

      if (tenantEmail) {
        await sendEmail({
          to: tenantEmail,
          subject: `Схвалено запит на оренду: ${booking.listing.title}`,
          html: `<h2>Чудова новина, ${booking.tenant.firstName}!</h2>
                 <p>Власник схвалив ваше бронювання речі <strong>"${booking.listing.title}"</strong>.</p>
                 <p><strong>Період оренди:</strong> ${dateStr}</p>
                 <p>Будь ласка, зв'яжіться з власником для уточнення деталей передачі речі.</p>`
        });
      }
    } else if (status === 'REJECTED') {
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_REJECTED',
          message: `На жаль, власник відхилив ваш запит на оренду інструменту "${booking.listing.title}" на дати ${dateStr}.`
        }
      });

      if (tenantEmail) {
        await sendEmail({
          to: tenantEmail,
          subject: `Відхилено запит на оренду: ${booking.listing.title}`,
          html: `<h2>Привіт, ${booking.tenant.firstName}.</h2>
                 <p>На жаль, власник відхилив ваш запит на оренду речі <strong>"${booking.listing.title}"</strong> на період ${dateStr}.</p>
                 <p>Ви можете знайти інші оголошення на нашому сайті.</p>`
        });
      }
    } else if (status === 'CANCELLED') {
      if (isTenant) {
        await prisma.notification.create({
          data: {
            userId: booking.listing.userId,
            type: 'BOOKING_CANCELLED_BY_TENANT',
            message: `Користувач ${tenantFullName} скасував своє бронювання інструменту "${booking.listing.title}" на дати ${dateStr}.`
          }
        });

        if (ownerEmail) {
          await sendEmail({
            to: ownerEmail,
            subject: `Бронювання скасовано орендарем: ${booking.listing.title}`,
            html: `<h2>Увага.</h2>
                   <p>Орендар <strong>${tenantFullName}</strong> скасував своє бронювання вашої речі <strong>"${booking.listing.title}"</strong> на період ${dateStr}.</p>
                   <p>Дати знову вільні для оренди іншими користувачами.</p>`
          });
        }
      } else if (isOwner) {
        const cancellationMessage = `Увага! Власник був змушений скасувати ваше бронювання інструменту "${booking.listing.title}" на дати ${dateStr}. Причина: ${reason || 'непередбачувані технічні обставини'}.`;
        
        await prisma.notification.create({
          data: {
            userId: booking.tenantId,
            type: 'BOOKING_CANCELLED_BY_OWNER',
            message: cancellationMessage
          }
        });

        if (tenantEmail) {
          await sendEmail({
            to: tenantEmail,
            subject: `Скасовано ваше бронювання: ${booking.listing.title}`,
            html: `<h2>Увага, ${booking.tenant.firstName}!</h2>
                   <p>Власник скасував ваше бронювання речі <strong>"${booking.listing.title}"</strong> на період ${dateStr}.</p>
                   <p><strong>Причина скасування:</strong> ${reason || 'Непередбачувані технічні обставини'}</p>
                   <p>Застава та сплачені кошти будуть повністю повернуті.</p>`
          });
        }
      }
    } else if (status === 'COMPLETED') {
      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_COMPLETED',
          message: `Власник підтвердив повернення інструменту "${booking.listing.title}". Дякуємо за користування!`
        }
      });

      if (tenantEmail) {
        await sendEmail({
          to: tenantEmail,
          subject: `Оренду завершено: ${booking.listing.title}`,
          html: `<h2>Дякуємо, ${booking.tenant.firstName}!</h2>
                 <p>Власник підтвердив успішне повернення речі <strong>"${booking.listing.title}"</strong>.</p>
                 <p>Оренду офіційно завершено. Будемо раді бачити вас знову!</p>`
        });
      }

      if (ownerEmail) {
        await sendEmail({
          to: ownerEmail,
          subject: `Підтвердження повернення речі: ${booking.listing.title}`,
          html: `<h2>Оренду завершено!</h2>
                 <p>Ви підтвердили повернення вашої речі <strong>"${booking.listing.title}"</strong> від орендаря <strong>${tenantFullName}</strong>.</p>
                 <p>Дякуємо за використання RentLocal!</p>`
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