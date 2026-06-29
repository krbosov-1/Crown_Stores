const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    query: async (text, params) => {
        try {
            const res = await pool.query(text, params);
            return res;
        } catch (error) {
            console.error('Query error!', { text, error });
            throw error;
        }
    },
    pool
};
