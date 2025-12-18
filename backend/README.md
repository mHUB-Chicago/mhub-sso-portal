## QA Tool Backend
### Local Development Environment Setup Instructions
#### Install packages
```
npm i
```
and common dependencies too 
```
cd ../common && npm i
```
#### Create .dev.vars file and update your environment variables
```
cp .dev.vars.example .dev.vars
```
#### Start local dev server
```
npm run dev
```
#### Generate migration after locally changing prisma.schema file
This generate a new migration file and will also apply the migration to your locally simulated D1 database
```
./scripts/generate_migration.sh
```
#### Apply the migration to the remote database
```
./scripts/apply_migration.sh
```
