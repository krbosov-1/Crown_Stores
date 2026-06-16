const db = require('../config/db');

async function logAction(userId, action, tableName, recordId, details, ipAddress) {
    try {
        const query = `
            INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const params = [
            userId || null,
            action,
            tableName || null,
            recordId || null,
            details ? JSON.stringify(details) : null,
            ipAddress || null
        ];
        
        await db.query(query, params);
    } catch (error) {
        // Wrap in try/catch silently as per instructions
        console.error('Audit Logger Error (Silenced):', error.message);
    }
}

module.exports = { logAction };
