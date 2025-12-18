#!/bin/bash
databaseName="mhub-sso-portal"
npx wrangler d1 migrations apply $databaseName --local
outputFile=$(mktemp)
D1_SQLITE=$(ls .wrangler/state/v3/d1/**/*.sqlite | head -n 1)
export DATABASE_URL="file:$D1_SQLITE"
npx prisma migrate diff --from-config-datasource --to-schema ./src/database/schema.prisma --script --output "$outputFile"
checkString=$(cat "$outputFile" | head -n 1)
if [ "$checkString" == "-- This is an empty migration." ]; then
  rm "$outputFile"
else
  createMigrationOutput=$(mktemp)
  wrangler d1 migrations create $databaseName migration > "$createMigrationOutput"
  targetMigrationPath=$(cat "$createMigrationOutput" | tail -n 1)
  cat "$outputFile" > "$targetMigrationPath"
  rm "$outputFile"
  rm "$createMigrationOutput"
fi
