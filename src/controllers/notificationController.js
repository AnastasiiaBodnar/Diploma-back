import prisma from '../config/prisma.js';

export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(notifications);
  } catch (error) {
    console.error('Помилка отримання сповіщень:', error);
    res.status(500).json({ error: 'Помилка на сервері під час отримання сповіщень' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(idNum)) {
      return res.status(400).json({ error: 'Некоректний ID сповіщення' });
    }

    const notification = await prisma.notification.findUnique({
      where: { id: idNum },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Сповіщення не знайдено' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ error: 'Ви не маєте доступу до цього сповіщення' });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: idNum },
      data: { isRead: true },
    });

    res.json({
      message: 'Сповіщення позначено як прочитане',
      notification: updatedNotification,
    });
  } catch (error) {
    console.error('Помилка позначення сповіщення як прочитаного:', error);
    res.status(500).json({ error: 'Помилка на сервері під час оновлення сповіщення' });
  }
};