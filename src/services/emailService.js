import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM
} = process.env;

let transporter;

// Ініціалізація транспорту
if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
} else {
  console.log(' Налаштування SMTP не знайдені в .env. EmailService працюватиме в режимі консолі.');
}

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