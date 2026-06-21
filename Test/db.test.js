require('dotenv').config();
const db = require('../src/config/db');

describe('Database Connection Tests', () => {
    
    it('Should connect to PostgreSQL and execute a simple query', async () => {
        const res = await db.query('SELECT 1 + 1 AS solution');
        expect(res.rows[0].solution).toBe(2);
    });

    afterAll(async () => {
        await db.pool.end(); 
    });

});