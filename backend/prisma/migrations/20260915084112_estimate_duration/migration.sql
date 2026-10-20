-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CostEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "total" DECIMAL NOT NULL,
    "totalIsLowerBound" BOOLEAN NOT NULL,
    "lowerBound" DECIMAL NOT NULL,
    "upperBound" DECIMAL,
    "assumptions" TEXT NOT NULL DEFAULT '[]',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEstimate_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CostEstimate" ("assumptions", "calculatedAt", "id", "lowerBound", "total", "totalIsLowerBound", "tripId", "upperBound") SELECT "assumptions", "calculatedAt", "id", "lowerBound", "total", "totalIsLowerBound", "tripId", "upperBound" FROM "CostEstimate";
DROP TABLE "CostEstimate";
ALTER TABLE "new_CostEstimate" RENAME TO "CostEstimate";
CREATE UNIQUE INDEX "CostEstimate_tripId_key" ON "CostEstimate"("tripId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
