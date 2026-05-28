# 🚀 RentLocal Backend — Shared Items Rental Service

[![Deploy Status](https://api.render.com/deploy/srv-d8c21j9kh4rs738gmp30?display=all)](https://diploma-phrb.onrender.com)

Backend service for the **RentLocal** web platform (shared items rental service), developed as part of a graduation thesis. The application is deployed on the Render cloud platform and integrated with a cloud-hosted PostgreSQL database on Neon.tech.

---

## 🛠️ Technology Stack

* **Runtime**: Node.js (ES Modules)
* **Framework**: Express.js
* **Database ORM**: Prisma Client
* **Database**: PostgreSQL (Neon.tech Cloud)
* **Authentication**: JSON Web Tokens (JWT) & bcrypt
* **Media Storage**: Cloudinary API (for secure listing image uploads)
* **CORS**: Configured for secure cross-origin communication with the frontend

---

## 🏗️ Database Schema (Prisma Models)

1. **User** — Platform users (tenants and landlords).
2. **Category** — Item categories (tools, electronics, apparel, etc.).
3. **Listing** — Rental listings (supports hybrid booking and `instantBooking` flow).
4. **Booking** — Rental orders (statuses: `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`).
5. **Review** — 1-to-5 star rating and feedback system (with built-in spam and rating manipulation protection).
6. **Notification** — In-app notification system for booking events and status updates.

---

## 🚀 Quick Start (Local Development)

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure `.env` File**:
   Create a `.env` file in the root directory and add your local environment variables:
   ```env
   PORT=5000
   DATABASE_URL="postgresql://postgres:password@localhost:5432/rentlocal"
   JWT_SECRET="your_jwt_secret_key"
   CLOUDINARY_CLOUD_NAME="your_cloudinary_name"
   CLOUDINARY_API_KEY="your_api_key"
   CLOUDINARY_API_SECRET="your_api_secret"
   ```

3. **Synchronize Prisma Database**:
   ```bash
   npx prisma db push
   ```

4. **Start the Server**:
   ```bash
   npm start
   ```
   The server will start on port `5000` (or the port specified in `.env`).
