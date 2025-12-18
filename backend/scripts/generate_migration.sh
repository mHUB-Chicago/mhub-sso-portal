#!/bin/bash
databaseName="axs-qa-tool-dev"
npx wrangler d1 migrations apply $databaseName --local
outputFile=$(mktemp)
npx prisma migrate diff --from-local-d1 --to-schema-datamodel ./src/database/schema.prisma --script --output "$outputFile"
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
