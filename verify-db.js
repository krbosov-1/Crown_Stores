require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
});

async function testConnection() {
    try {
        console.log('Testing connection to PostgreSQL...');
        console.log(`Host: ${process.env.SQL_HOST}`);
        console.log(`User: ${process.env.SQL_USER}`);
        console.log(`Database: ${process.env.SQL_DB_NAME}`);
        
        const client = await pool.connect();
        console.log('✅ Connection successful!');
        
        const result = await client.query('SELECT NOW() as time');
        console.log(`Database time: ${result.rows[0].time}`);
        
        client.release();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed!');
        console.error(err);
        process.exit(1);
    }
}

testConnection();
