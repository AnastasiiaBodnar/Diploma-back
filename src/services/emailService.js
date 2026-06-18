import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  BREVO_API_KEY,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME
} = process.env;

let transporter;
const emailStatus = {
  provider: null,
  configured: false,
  connected: false,
  error: null,
  details: {}
};

if (BREVO_API_KEY) {
  // Використовуємо Brevo HTTP API (ідеально для безкоштовного тарифу Render)
  emailStatus.provider = 'brevo';
  emailStatus.configured = true;
  emailStatus.connected = true; // HTTP API не потребує постійного з'єднання
  emailStatus.details = {
    senderEmail: BREVO_SENDER_EMAIL || SMTP_USER || 'bodnar.anastasiia.2007@gmail.com',
    senderName: BREVO_SENDER_NAME || 'RentLocal'
  };
  console.log('✅ Налаштовано Brevo HTTP API для відправки листів (безпечно для Render).');
} else if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  // Використовуємо стандартний SMTP
  emailStatus.provider = 'smtp';
  emailStatus.configured = true;
  emailStatus.details = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER ? `${SMTP_USER.substring(0, 3)}...` : null
  };

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
      emailStatus.connected = false;
      emailStatus.error = error.message || error;
      console.error('❌ Помилка підключення до SMTP сервісу:', emailStatus.error);
    } else {
      emailStatus.connected = true;
      emailStatus.error = null;
      console.log('✅ SMTP сервер успішно підключено. Готовий до відправки листів.');
    }
  });
} else {
  console.log('⚠️ Налаштування SMTP або Brevo не знайдені. EmailService працюватиме в режимі консолі.');
}

export const getSMTPStatus = () => emailStatus;

export const sendEmail = async ({ to, subject, html }) => {
  try {
    if (BREVO_API_KEY) {
      const senderEmail = BREVO_SENDER_EMAIL || SMTP_USER || 'bodnar.anastasiia.2007@gmail.com';
      const senderName = BREVO_SENDER_NAME || 'RentLocal';

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`Лист успішно надіслано на ${to} через Brevo HTTP API. Message ID: ${data.messageId}`);
        return data;
      } else {
        throw new Error(data.message || JSON.stringify(data));
      }
    } else if (transporter) {
      // Стандартний SMTP
      const mailOptions = {
        from: EMAIL_FROM || '"RentLocal" <noreply@rentlocal.com>',
        to,
        subject,
        html,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Лист успішно надіслано на ${to}. Message ID: ${info.messageId}`);
      return info;
    } else {
      // Якщо нічого не налаштовано, виводимо в консоль
      console.log('\n=================== EMAIL PREVIEW ===================');
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      console.log('------------------- HTML CONTENT -------------------');
      console.log(html.replace(/<[^>]*>/g, ' '));
      console.log('=====================================================\n');
      return { messageId: 'console-mock-id' };
    }
  } catch (error) {
    console.error(`Помилка відправки листа на ${to}:`, error.message || error);
  }
};