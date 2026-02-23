#!/bin/sh
set -e

echo "Waiting for database..."
node -e "const { Client } = require('pg'); const url = process.env.DATABASE_URL; let tries = 0; const max = 30; const sleep = (ms)=>new Promise(r=>setTimeout(r,ms)); (async ()=>{ while(true){ try { const c = new Client({ connectionString: url }); await c.connect(); await c.end(); console.log('Database is ready'); process.exit(0);} catch (e){ tries++; if(tries>=max){ console.error('Database not ready after retries'); process.exit(1);} await sleep(2000);} } })();"

node dist/db/migrate.js
node dist/db/seed.js
node dist/server.js
