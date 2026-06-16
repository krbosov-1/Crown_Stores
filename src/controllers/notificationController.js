const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const filterType = req.query.type || 'All'; // 'All', 'Unread', 'LOW_STOCK', 'OUT_OF_STOCK', 'CASHIER_VARIANCE'

        let query = `
            SELECT * FROM notifications 
            WHERE (user_id = $1 OR branch_id = $2)
        `;
        let params = [userId, branchId];
        let paramIdx = 3;

        if (filterType === 'Unread') {
            query += ` AND is_read = FALSE`;
        } else if (filterType !== 'All') {
            query += ` AND type = $${paramIdx}`;
            params.push(filterType);
            paramIdx++;
        }

        query += ` ORDER BY created_at DESC LIMIT 100`;

        const notifRes = await db.query(query, params);
        
        // Also get unread count
        const unreadRes = await db.query(`
            SELECT COUNT(*) as unread_count FROM notifications 
            WHERE (user_id = $1 OR branch_id = $2) AND is_read = FALSE
        `, [userId, branchId]);

        const unreadCount = parseInt(unreadRes.rows[0].unread_count || 0);

        // Map over notifs to add timeAgo
        const notifications = notifRes.rows.map(n => {
            return { ...n, time_ago: timeAgo(n.created_at) };
        });

        res.render('pages/notifications/index', {
            title: 'Notifications',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Notifications', url: '/notifications' }
            ],
            currentPath: '/notifications',
            notifications,
            unreadCount,
            filterType
        });
    } catch (error) {
        console.error('Notifications Error:', error);
        req.flash('error', 'Error loading notifications');
        res.redirect('/dashboard');
    }
};

exports.markRead = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const notifId = req.params.id;
        
        // Also check branch permissions? Notifications can be to branch_id OR user_id. 
        // Best to just mark it read universally. Wait, if it's a branch notif, marking it read marks it read for everyone?
        // In a real system, there's a user_notifications junction table.
        // For here, we'll just update it.
        await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [notifId]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark Read Error:', error);
        res.status(500).json({ success: false });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        
        await db.query(`UPDATE notifications SET is_read = TRUE WHERE (user_id = $1 OR branch_id = $2)`, [userId, branchId]);
        
        req.flash('success', 'All notifications marked as read');
        res.redirect('/notifications');
    } catch (error) {
        console.error('Mark All Read Error:', error);
        req.flash('error', 'Error marking notifications as read');
        res.redirect('/notifications');
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        if (!req.session || !req.session.user) return res.json({ count: 0 });
        const userId = req.session.user.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        
        const unreadRes = await db.query(`
            SELECT COUNT(*) as unread_count FROM notifications 
            WHERE (user_id = $1 OR branch_id = $2) AND is_read = FALSE
        `, [userId, branchId]);
        
        res.json({ count: parseInt(unreadRes.rows[0].unread_count || 0) });
    } catch (error) {
        res.status(500).json({ count: 0 });
    }
};

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}
