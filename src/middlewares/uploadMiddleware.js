import multer from 'multer';

// Використовуємо пам'ять (RAM) для тимчасового зберігання буфера файлу
const storage = multer.memoryStorage();

// Валідація типів файлів (дозволяємо тільки зображення)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимий формат файлу. Завантажуйте лише зображення!'), false);
  }
};

// Конфігуруємо Multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Максимальний розмір файлу — 5 МБ
  },
});

export default upload;