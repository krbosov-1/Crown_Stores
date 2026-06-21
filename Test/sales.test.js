require('dotenv').config();
const db = require('../src/config/db');

describe('Sales & Inventory Business Logic Tests', () => {
    let testProductId;
    let testBranchId; // ضفنا متغير للفرع
    let initialStock;
    const qtyToSell = 2; 

    beforeAll(async () => {
        await db.query('BEGIN'); 

        // خلينا الروبوت يختار منتج وفرع معينين كميتهم أكبر من 5
        const productRes = await db.query('SELECT product_id, branch_id, quantity_available FROM inventory WHERE quantity_available > 5 LIMIT 1');
        
        if(productRes.rows.length > 0) {
            testProductId = productRes.rows[0].product_id;
            testBranchId = productRes.rows[0].branch_id; // حفظنا رقم الفرع
            initialStock = productRes.rows[0].quantity_available;
        }
    });

    it('Should deduct inventory correctly when a sale is processed', async () => {
        if (!testProductId) {
            console.log('No products available for testing. Skipping...');
            return;
        }

        // التعديل هنا: حددنا ليهو يخصم من الفرع المعين بس!
        await db.query('UPDATE inventory SET quantity_available = quantity_available - $1 WHERE product_id = $2 AND branch_id = $3', [qtyToSell, testProductId, testBranchId]);

        // نقرأ الكمية الجديدة لنفس المنتج في نفس الفرع
        const checkRes = await db.query('SELECT quantity_available FROM inventory WHERE product_id = $1 AND branch_id = $2', [testProductId, testBranchId]);
        const newStock = checkRes.rows[0].quantity_available;

        expect(newStock).toBe(initialStock - qtyToSell);
    });

    afterAll(async () => {
        await db.query('ROLLBACK'); 
        await db.pool.end(); 
    });

});