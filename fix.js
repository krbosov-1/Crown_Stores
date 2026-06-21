require('dotenv').config();
const db = require('./src/config/db');

async function fixDB() {
    try {
        console.log('⏳ جاري إضافة كل الأعمدة الناقصة لجدول procurement...');
        
        // إضافة كل الأعمدة اللي السيرفر بيشتكي منها
        await db.query(`
            ALTER TABLE procurement 
            ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
        `);
        
        console.log('✅ تم إضافة الأعمدة بنجاح. السيستم المفروض يشتغل طلقة!');
    } catch (err) {
        console.log('⚠️ خطأ:', err.message);
    } finally {
        process.exit();
    }
}

fixDB();
