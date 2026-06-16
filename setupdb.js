const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const db = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER,
    password: process.env.SQL_ADMIN_PASSWORD,
    database: process.env.SQL_DB_NAME,
});

async function setupDB() {
    try {
        console.log('Connecting to database...');
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const seedPath = path.join(__dirname, 'database', 'seed.sql');

        console.log('Reading schema.sql...');
        const schemaQuery = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema.sql...');
        await db.query(schemaQuery);

        console.log('Reading seed.sql...');
        const seedQuery = fs.readFileSync(seedPath, 'utf8');

        console.log('Executing seed.sql...');
        await db.query(seedQuery);

        console.log('Granting permissions to app user...');
        await db.query(`
            GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${process.env.SQL_USER}";
            GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${process.env.SQL_USER}";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "${process.env.SQL_USER}";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "${process.env.SQL_USER}";
        `);

        console.log('Database setup successful');
        process.exit(0);
    } catch (err) {
        console.error('Error setting up database:', err);
        process.exit(1);
    }
}

setupDB();
