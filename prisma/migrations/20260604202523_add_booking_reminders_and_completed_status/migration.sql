-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "endingReminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overdueReminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tomorrowReminderSent" BOOLEAN NOT NULL DEFAULT false;
