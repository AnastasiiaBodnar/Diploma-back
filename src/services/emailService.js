import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM
} = process.env;

let transporter;
const smtpStatus = {
  configured: false,
  connected: false,
  error: null,
  details: {
    host: SMTP_HOST || null,
    port: SMTP_PORT || null,
    user: SMTP_USER ? `${SMTP_USER.substring(0, 3)}...` : null, // Mask user for security
  }
};

// Ініціалізація транспорту
if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  smtpStatus.configured = true;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // Перевірка зв'язку з SMTP сервером на старті
  transporter.verify((error, success) => {
    if (error) {
      smtpStatus.connected = false;
      smtpStatus.error = error.message || error;
      console.error('❌ Помилка підключення до SMTP сервісу:', smtpStatus.error);
    } else {
      smtpStatus.connected = true;
      smtpStatus.error = null;
      console.log('✅ SMTP сервер успішно підключено. Готовий до відправки листів.');
    }
  });
} else {
  console.log('⚠️ Налаштування SMTP не знайдені в .env. EmailService працюватиме в режимі консолі.');
}

export const getSMTPStatus = () => smtpStatus;

export const sendEmail = async ({ to, subject, html }) => {
  try {
    const mailOptions = {
      from: EMAIL_FROM || '"RentLocal" <noreply@rentlocal.com>',
      to,
      subject,
      html,
    };

    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`Лист успішно надіслано на ${to}. Message ID: ${info.messageId}`);
      return info;
    } else {
      // Якщо SMTP не налаштовано, виводимо в консоль
      console.log('\n=================== EMAIL PREVIEW ===================');
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      console.log('------------------- HTML CONTENT -------------------');
      console.log(html.replace(/<[^>]*>/g, ' '));
      console.log('=====================================================\n');
      return { messageId: 'console-mock-id' };
    }
  } catch (error) {
    console.error(`Помилка відправки листа на ${to}:`, error);
  }
};