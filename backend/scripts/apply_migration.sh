#!/bin/bash
databaseName="axs-qa-tool-dev"
npx wrangler d1 migrations apply $databaseName --remote
