import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { sendEmail } from './emailService.js';

// 1. Автоматичне скасування PENDING запитів, які не були оброблені протягом 24 годин
const cancelExpiredBookings = async () => {
  try {
    const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 години тому

    const pendingBookings = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lte: expiredTime }
      },
      include: {
        listing: {
          include: {
            user: { select: { email: true, firstName: true } }
          }
        },
        tenant: { select: { email: true, firstName: true } }
      }
    });

    for (const booking of pendingBookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED' }
      });

      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'BOOKING_EXPIRED',
          message: `Ваш запит на оренду "${booking.listing.title}" було автоматично скасовано, оскільки власник не відповів протягом 24 годин.`
        }
      });

      await prisma.notification.create({
        data: {
          userId: booking.listing.userId,
          type: 'BOOKING_EXPIRED_OWNER',
          message: `Запит на оренду "${booking.listing.title}" від ${booking.tenant.firstName || 'орендаря'} скасовано через відсутність вашої відповіді протягом 24 годин.`
        }
      });

      if (booking.tenant?.email) {
        await sendEmail({
          to: booking.tenant.email,
          subject: `Запит скасовано автоматично: ${booking.listing.title}`,
          html: `<h2>Привіт, ${booking.tenant.firstName}!</h2>
                 <p>На жаль, ваш запит на оренду речі <strong>"${booking.listing.title}"</strong> був автоматично скасований.</p>
                 <p>Власник не відповів на запит протягом 24 годин. Жодні кошти або застава не списувалися.</p>`
        });
      }

      if (booking.listing.user?.email) {
        await sendEmail({
          to: booking.listing.user.email,
          subject: `Запит скасовано через неактивність: ${booking.listing.title}`,
          html: `<h2>Привіт!</h2>
                 <p>Запит на оренду вашої речі <strong>"${booking.listing.title}"</strong> від ${booking.tenant.firstName || 'користувача'} був автоматично скасований, оскільки ви не відповіли на нього протягом 24 годин.</p>
                 <p>Будь ласка, намагайтеся відповідати вчасно, щоб не втрачати клієнтів.</p>`
        });
      }
    }

    if (pendingBookings.length > 0) {
      console.log(`[Cron] Автоматично скасовано запитів через неактивність: ${pendingBookings.length}`);
    }
  } catch (error) {
    console.error('[Cron Error] Помилка скасування застарілих запитів:', error);
  }
};

// 2. Нагадування за 24 години до закінчення оренди
const sendTomorrowReminders = async () => {
  try {
    const now = new Date();
    const targetStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23 години вперед
    const targetEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);   // 24 години вперед

    // Знаходимо оренди, де дата завершення оренди настане в межах наступних 23-24 годин
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        tomorrowReminderSent: false,
        endDate: {
          gte: targetStart,
          lte: targetEnd
        }
      },
      include: {
        listing: true,
        tenant: { select: { email: true, firstName: true } }
      }
    });

    for (const booking of bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { tomorrowReminderSent: true }
      });

      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'RENTAL_ENDING_TOMORROW',
          message: `Нагадування: термін оренди речі "${booking.listing.title}" закінчується завтра.`
        }
      });

      if (booking.tenant?.email) {
        await sendEmail({
          to: booking.tenant.email,
          subject: `Нагадування: оренда закінчується завтра - ${booking.listing.title}`,
          html: `<h2>Привіт, ${booking.tenant.firstName}!</h2>
                 <p>Нагадуємо, що термін оренди речі <strong>"${booking.listing.title}"</strong> закінчується завтра.</p>
                 <p>Будь ласка, сплануйте повернення речі та зв'яжіться з власником для узгодження деталей.</p>`
        });
      }
    }

    if (bookings.length > 0) {
      console.log(`[Cron] Надіслано нагадувань за 24 години: ${bookings.length}`);
    }
  } catch (error) {
    console.error('[Cron Error] Помилка нагадувань за 24 години:', error);
  }
};

// 3. Нагадування за 2 години до закінчення оренди
const sendEndingReminders = async () => {
  try {
    const now = new Date();
    const targetEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 години вперед

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        endingReminderSent: false,
        endDate: {
          gte: now,
          lte: targetEnd
        }
      },
      include: {
        listing: {
          include: {
            user: { select: { email: true, firstName: true } }
          }
        },
        tenant: { select: { email: true, firstName: true } }
      }
    });

    for (const booking of bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { endingReminderSent: true }
      });

      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'RENTAL_ENDING_SOON',
          message: `Увага: оренда речі "${booking.listing.title}" закінчується сьогодні через 2 години.`
        }
      });

      if (booking.tenant?.email) {
        await sendEmail({
          to: booking.tenant.email,
          subject: `Оренда закінчується через 2 години! - ${booking.listing.title}`,
          html: `<h2>Увага, ${booking.tenant.firstName}!</h2>
                 <p>Термін оренди речі <strong>"${booking.listing.title}"</strong> закінчується сьогодні через 2 години.</p>
                 <p>Будь ласка, поверніть річ власнику вчасно, щоб уникнути непорозумінь та можливих штрафів.</p>`
        });
      }

      if (booking.listing.user?.email) {
        await sendEmail({
          to: booking.listing.user.email,
          subject: `Очікуйте повернення речі сьогодні: ${booking.listing.title}`,
          html: `<h2>Привіт!</h2>
                 <p>Оренда вашої речі <strong>"${booking.listing.title}"</strong> закінчується через 2 години.</p>
                 <p>Коли ви отримаєте річ назад, будь ласка, зайдіть у свій кабінет і натисніть кнопку <strong>«Підтвердити повернення»</strong>, щоб офіційно закрити оренду.</p>`
        });
      }
    }

    if (bookings.length > 0) {
      console.log(`[Cron] Надіслано нагадувань за 2 години: ${bookings.length}`);
    }
  } catch (error) {
    console.error('[Cron Error] Помилка нагадувань за 2 години:', error);
  }
};

// 4. Попередження про прострочення повернення
const sendOverdueReminders = async () => {
  try {
    const now = new Date();

    // Замовлення, де endDate в минулому, але статус досі CONFIRMED (не завершено), і нагадування про прострочення ще не надсилалося
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        overdueReminderSent: false,
        endDate: {
          lt: now
        }
      },
      include: {
        listing: {
          include: {
            user: { select: { email: true, firstName: true } }
          }
        },
        tenant: { select: { email: true, firstName: true } }
      }
    });

    for (const booking of bookings) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { overdueReminderSent: true }
      });

      await prisma.notification.create({
        data: {
          userId: booking.tenantId,
          type: 'RENTAL_OVERDUE',
          message: `КРИТИЧНО: Термін оренди речі "${booking.listing.title}" закінчився, але ви її не повернули!`
        }
      });

      await prisma.notification.create({
        data: {
          userId: booking.listing.userId,
          type: 'RENTAL_OVERDUE_OWNER',
          message: `Увага: термін оренди речі "${booking.listing.title}" минув, але орендар не повернув її вчасно.`
        }
      });

      // Email орендарю
      if (booking.tenant?.email) {
        await sendEmail({
          to: booking.tenant.email,
          subject: `УВАГА: Термін оренди прострочено! - ${booking.listing.title}`,
          html: `<h2>Шановний(а) ${booking.tenant.firstName},</h2>
                 <p style="color: red; font-weight: bold; font-size: 16px;">Ви прострочили термін оренди речі "${booking.listing.title}".</p>
                 <p>Ви повинні були повернути річ до: ${booking.endDate.toLocaleString('uk-UA')}.</p>
                 <p>Будь ласка, терміново зв'яжіться з власником. Нагадуємо, що прострочення оренди є порушенням правил сервісу і може призвести до стягнення застави у розмірі <strong>${booking.listing.deposit} грн</strong>, додаткових штрафів або блокування вашого акаунту.</p>`
        });
      }

      // Email власнику
      if (booking.listing.user?.email) {
        await sendEmail({
          to: booking.listing.user.email,
          subject: `Орендар не повернув річ вчасно: ${booking.listing.title}`,
          html: `<h2>Увага!</h2>
                 <p>Орендар <strong>${booking.tenant?.firstName || 'користувач'}</strong> не повернув вашу річ <strong>"${booking.listing.title}"</strong> вчасно (дедлайн був: ${booking.endDate.toLocaleString('uk-UA')}).</p>
                 <p>Ми надіслали орендарю офіційне попередження.</p>
                 <p>Якщо орендар не повертає річ або не виходить на зв'язок, ви можете вимагати списання застави (${booking.listing.deposit} грн) або звернутися в підтримку.</p>`
        });
      }
    }

    if (bookings.length > 0) {
      console.log(`[Cron] Надіслано попереджень про прострочення повернення: ${bookings.length}`);
    }
  } catch (error) {
    console.error('[Cron Error] Помилка нагадувань про прострочення:', error);
  }
};

export const startCron = () => {
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Запуск планової фонової перевірки...');
    await cancelExpiredBookings();
    await sendTomorrowReminders();
    await sendEndingReminders();
    await sendOverdueReminders();
  });

  console.log(' Фоновий планувальник завдань (node-cron) успішно ініціалізовано.');
};

export const runAllJobsManually = async () => {
  console.log('[Cron Manual] Запуск перевірок вручну...');
  await cancelExpiredBookings();
  await sendTomorrowReminders();
  await sendEndingReminders();
  await sendOverdueReminders();
  console.log('[Cron Manual] Усі перевірки виконано.');
};