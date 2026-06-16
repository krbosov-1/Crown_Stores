const db = require('./src/config/db');

async function test() {
    try {
        console.log('Testing director queries...');
        await db.query('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE DATE(sale_date) = CURRENT_DATE');
        await db.query(`SELECT COUNT(*) AS total FROM products WHERE status = 'active'`);
        
        await db.query(`
            SELECT b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as total 
            FROM branches b 
            LEFT JOIN sales s ON b.id = s.branch_id AND DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE) 
            WHERE b.status = 'active' 
            GROUP BY b.id, b.name 
            ORDER BY total DESC
        `);
        console.log('Director queries OK');
        
        console.log('Testing manager queries...');
        const branchId = 1;
        await db.query(`SELECT COUNT(*) as total FROM products WHERE branch_id = $1 AND status = 'active'`, [branchId]);
        console.log('Manager queries OK');
        
        process.exit(0);
    } catch(err) {
        console.error('SQL test failed:', err);
        process.exit(1);
    }
}

test();
