-- AlterTable
ALTER TABLE "MeetRecap" ADD COLUMN "client" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "client" TEXT;
ALTER TABLE "Task" ADD COLUMN "deliverTo" TEXT;

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "briefingSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_googleId_key" ON "CalendarEvent"("googleId");
