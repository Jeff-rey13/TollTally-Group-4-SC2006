-- CreateTable
CREATE TABLE "TrafficHour" (
    "hour" DATETIME NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "clientErrors" INTEGER NOT NULL DEFAULT 0,
    "serverErrors" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "totalMs" INTEGER NOT NULL DEFAULT 0,
    "maxMs" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("hour", "endpoint")
);
