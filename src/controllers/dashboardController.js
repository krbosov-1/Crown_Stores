const db = require('../config/db');

async function getUnreadCount(userId) {
    try {
        const res = await db.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE', [userId]);
        return parseInt(res.rows[0].count, 10);
    } catch (error) {
        console.error('Error fetching unread count:', error);
        return 0;
    }
}

exports.directorDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const unreadCount = await getUnreadCount(userId);

        // تحسين الأداء: استخدام CURRENT_DATE مباشرة بدون دالة DATE() لتفعيل الفهارس (Indexes)
        const [
            todaySalesRes, 
            inventoryValueRes, 
            branchesRes, 
            productsRes,
            sales7DaysRes,
            branchSalesRes,
            categoriesRes,
            branchTableRes
        ] = await Promise.all([
            db.query('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE sale_date >= CURRENT_DATE'),
            db.query(`SELECT COALESCE(SUM(i.quantity_available * p.selling_price), 0) AS total 
                      FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.status = 'active'`),
            db.query(`SELECT COUNT(*) AS total FROM branches WHERE status = 'active'`),
            db.query(`SELECT COUNT(*) AS total FROM products WHERE status = 'active'`),
            db.query(`
                WITH dates AS (
                    SELECT CAST(current_date - i AS DATE) as date
                    FROM generate_series(0, 6) i
                )
                SELECT d.date, COALESCE(SUM(s.total_amount), 0) as total
                FROM dates d
                LEFT JOIN sales s ON s.sale_date >= d.date AND s.sale_date < d.date + 1
                GROUP BY d.date
                ORDER BY d.date ASC
            `),
            db.query(`
                SELECT b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as total 
                FROM branches b 
                LEFT JOIN sales s ON b.id = s.branch_id AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
                WHERE b.status = 'active' 
                GROUP BY b.id, b.name 
                ORDER BY total DESC
            `),
            db.query(`
                SELECT c.name as category_name, COALESCE(SUM(si.subtotal), 0) as total 
                FROM categories c
                JOIN products p ON c.id = p.category_id
                JOIN sale_items si ON p.id = si.product_id
                JOIN sales s ON si.sale_id = s.id AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
                GROUP BY c.id, c.name 
                ORDER BY total DESC 
                LIMIT 5
            `),
            db.query(`
                SELECT 
                    b.name as branch, 
                    COALESCE(SUM(s.total_amount), 0) as today_sales, 
                    COALESCE((SELECT SUM(i.quantity_available * p.selling_price) FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = b.id AND p.status = 'active'), 0) as inventory_value, 
                    (SELECT COUNT(*) FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = b.id AND i.quantity_available < p.reorder_level AND p.status = 'active') as low_stock_count, 
                    b.status 
                FROM branches b 
                LEFT JOIN sales s ON b.id = s.branch_id AND s.sale_date >= CURRENT_DATE 
                GROUP BY b.id, b.name, b.status 
                ORDER BY today_sales DESC
            `)
        ]);

        const stats = {
            todaySales: parseFloat(todaySalesRes.rows[0].total),
            inventoryValue: parseFloat(inventoryValueRes.rows[0].total),
            activeBranches: parseInt(branchesRes.rows[0].total, 10),
            activeProducts: parseInt(productsRes.rows[0].total, 10)
        };

        const chartSales7Days = sales7DaysRes.rows.map(r => ({
            date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            total: parseFloat(r.total)
        }));

        const chartBranchSales = branchSalesRes.rows.map(r => ({
            branch_name: r.branch_name,
            total: parseFloat(r.total)
        }));

        const chartCategories = categoriesRes.rows.map(r => ({
            category_name: r.category_name,
            total: parseFloat(r.total)
        }));

        const branchTable = branchTableRes.rows.map(r => ({
            branch: r.branch,
            today_sales: parseFloat(r.today_sales),
            inventory_value: parseFloat(r.inventory_value),
            low_stock_count: parseInt(r.low_stock_count, 10),
            status: r.status
        }));

        res.render('pages/dashboard/director', {
            title: 'Director Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount,
            stats,
            chartSales7Days,
            chartBranchSales,
            chartCategories,
            branchTable
        });
    } catch (error) {
        console.error('Director Dashboard Error:', error);
        req.flash('error', 'Error loading dashboard data');
        res.render('pages/dashboard/director', {
            title: 'Director Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount: 0,
            stats: { todaySales: 0, inventoryValue: 0, activeBranches: 0, activeProducts: 0 },
            chartSales7Days: [], chartBranchSales: [], chartCategories: [], branchTable: []
        });
    }
};

exports.managerDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId; 
        const unreadCount = await getUnreadCount(userId);

        const [
            todaySalesRes,
            activeProductsRes,
            lowStockRes,
            outOfStockRes,
            lowStockListRes,
            outOfStockListRes,
            recentProcurementsRes,
            recentSalesRes
        ] = await Promise.all([
            db.query('SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as tx_count FROM sales WHERE branch_id = $1 AND sale_date >= CURRENT_DATE', [branchId]),
            db.query(`SELECT COUNT(*) as total FROM products WHERE status = 'active'`),
            db.query(`SELECT COUNT(*) as total FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = $1 AND i.quantity_available < p.reorder_level AND i.quantity_available > 0 AND p.status = 'active'`, [branchId]),
            db.query(`SELECT COUNT(*) as total FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = $1 AND i.quantity_available = 0 AND p.status = 'active'`, [branchId]),
            db.query(`SELECT p.name, i.quantity_available as qty, p.reorder_level FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = $1 AND i.quantity_available < p.reorder_level AND i.quantity_available > 0 AND p.status = 'active' ORDER BY (i.quantity_available::float / p.reorder_level::float) ASC LIMIT 10`, [branchId]),
            db.query(`SELECT p.name FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = $1 AND i.quantity_available = 0 AND p.status = 'active' LIMIT 5`, [branchId]),
            db.query(`SELECT p.name as product_name, pr.quantity_received, pr.date_received FROM procurement pr JOIN products p ON pr.product_id = p.id WHERE pr.branch_id = $1 ORDER BY pr.created_at DESC LIMIT 5`, [branchId]),
            db.query(`SELECT id, total_amount, sale_date, COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale_id = sales.id), 0) as items_count FROM sales WHERE branch_id = $1 ORDER BY sale_date DESC LIMIT 5`, [branchId])
        ]);

        const stats = {
            todaySales: parseFloat(todaySalesRes.rows[0].total),
            transactionsCount: parseInt(todaySalesRes.rows[0].tx_count, 10),
            activeProducts: parseInt(activeProductsRes.rows[0].total, 10),
            lowStock: parseInt(lowStockRes.rows[0].total, 10),
            outOfStock: parseInt(outOfStockRes.rows[0].total, 10)
        };

        res.render('pages/dashboard/manager', {
            title: 'Manager Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount,
            stats,
            lowStockList: lowStockListRes.rows,
            outOfStockList: outOfStockListRes.rows,
            recentProcurements: recentProcurementsRes.rows,
            recentSales: recentSalesRes.rows.map(r => ({
                ...r,
                total_amount: parseFloat(r.total_amount),
                items_count: parseInt(r.items_count, 10)
            }))
        });

    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        req.flash('error', 'Error loading dashboard data');
        res.render('pages/dashboard/manager', {
            title: 'Manager Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount: 0,
            stats: { todaySales: 0, transactionsCount: 0, activeProducts: 0, lowStock: 0, outOfStock: 0 },
            lowStockList: [], outOfStockList: [], recentProcurements: [], recentSales: []
        });
    }
};

exports.agentDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const unreadCount = await getUnreadCount(userId);

        const [
            todaySalesRes,
            monthSalesRes,
            recentSalesRes
        ] = await Promise.all([
            db.query('SELECT COUNT(*) as sale_count, COALESCE(SUM(total_amount), 0) as total_revenue FROM sales WHERE sales_agent_id = $1 AND sale_date >= CURRENT_DATE', [userId]),
            db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE sales_agent_id = $1 AND sale_date >= DATE_TRUNC('month', CURRENT_DATE)`, [userId]),
            db.query(`SELECT s.id as sale_id, s.sale_date as time, COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id), 0) as items_count, s.total_amount as total, s.amount_paid, s.change_given FROM sales s WHERE s.sales_agent_id = $1 ORDER BY s.sale_date DESC LIMIT 10`, [userId])
        ]);

        const stats = {
            todaySaleCount: parseInt(todaySalesRes.rows[0].sale_count, 10),
            todayRevenue: parseFloat(todaySalesRes.rows[0].total_revenue),
            monthSales: parseFloat(monthSalesRes.rows[0].total)
        };

        res.render('pages/dashboard/agent', {
            title: 'Agent Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount,
            stats,
            recentSales: recentSalesRes.rows.map(r => ({
                ...r,
                items_count: parseInt(r.items_count, 10),
                total: parseFloat(r.total),
                amount_paid: parseFloat(r.amount_paid),
                change_given: parseFloat(r.change_given)
            }))
        });

    } catch (error) {
        console.error('Agent Dashboard Error:', error);
        req.flash('error', 'Error loading dashboard data');
        res.render('pages/dashboard/agent', {
            title: 'Agent Dashboard',
            breadcrumb: [{ label: 'Dashboard', url: '/dashboard' }],
            currentPath: '/dashboard',
            unreadCount: 0,
            stats: { todaySaleCount: 0, todayRevenue: 0, monthSales: 0 },
            recentSales: []
        });
    }
};
