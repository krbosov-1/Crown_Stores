const db = require('../config/db');
const PDFDocument = require('pdfkit');

exports.index = async (req, res) => {
    try {
        const role = req.session.user.role;
        let branchId = req.session.user.branch_id || req.session.user.branchId;
        
        let { date_from, date_to, branch_id: filterBranch } = req.query;

        if (!date_from) date_from = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
        if (!date_to) date_to = new Date().toISOString().split('T')[0];

        // Director can filter by branch
        if (role === 'director' && filterBranch) {
            branchId = filterBranch;
        }

        const branchesRes = await db.query('SELECT id, name FROM branches WHERE status = $1', ['active']);
        const allBranches = branchesRes.rows;

        // 1. Sales Report Data
        let salesQuery = `
            SELECT s.sale_date, s.total_amount, si.quantity, p.name as product_name, c.name as category_name
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE DATE(s.sale_date) >= $1 AND DATE(s.sale_date) <= $2
        `;
        let salesParams = [date_from, date_to];
        if (role === 'manager' || (role === 'director' && branchId)) {
            salesQuery += ` AND s.branch_id = $3`;
            salesParams.push(branchId);
        }

        const salesRawRes = await db.query(salesQuery, salesParams);
        
        const totalRevenue = salesRawRes.rows.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0) / (salesRawRes.rows.length || 1); // approximate, since we duplicated sales by items
        
        // Wait, standardizing the aggregation
        let salesAggQuery = `
            SELECT COUNT(DISTINCT s.id) as trans_count, SUM(DISTINCT s.total_amount) as total_rev
            FROM sales s
            WHERE DATE(s.sale_date) >= $1 AND DATE(s.sale_date) <= $2
        `;
        let aggParams = [date_from, date_to];
        if (role === 'manager' || (role === 'director' && branchId)) {
            salesAggQuery += ` AND s.branch_id = $3`;
            aggParams.push(branchId);
        }
        const salesAggRes = await db.query(salesAggQuery, aggParams);
        const transCount = parseInt(salesAggRes.rows[0].trans_count || 0);
        
        let totalRev = 0;
        if (role === 'manager' || branchId) {
             const revRes = await db.query(`SELECT SUM(total_amount) as rev FROM sales WHERE DATE(sale_date) >= $1 AND DATE(sale_date) <= $2 AND branch_id = $3`, [date_from, date_to, branchId]);
             totalRev = parseFloat(revRes.rows[0]?.rev || 0);
        } else {
             const revRes = await db.query(`SELECT SUM(total_amount) as rev FROM sales WHERE DATE(sale_date) >= $1 AND DATE(sale_date) <= $2`, [date_from, date_to]);
             totalRev = parseFloat(revRes.rows[0]?.rev || 0);
        }

        const avgOrderValue = transCount > 0 ? totalRev / transCount : 0;

        // Grouping for products
        const topProductsMap = {};
        salesRawRes.rows.forEach(r => {
            if(!topProductsMap[r.product_name]) {
                topProductsMap[r.product_name] = {
                    name: r.product_name,
                    category: r.category_name || 'N/A',
                    qty: 0,
                    revenue: 0
                };
            }
            topProductsMap[r.product_name].qty += parseInt(r.quantity);
        });

        const salesProductQuery = `
            SELECT p.name, c.name as category_name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_revenue
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            JOIN products p ON si.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE DATE(s.sale_date) >= $1 AND DATE(s.sale_date) <= $2
            ${(role === 'manager' || branchId) ? 'AND s.branch_id = ' + (branchId) : ''}
            GROUP BY p.name, c.name
            ORDER BY total_revenue DESC
        `;
        const productsReportRes = await db.query(salesProductQuery, [date_from, date_to]);
        const salesProducts = productsReportRes.rows.map(r => {
             const rev = parseFloat(r.total_revenue || 0);
             return {
                 ...r,
                 revenue: rev,
                 percentage: totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : 0
             };
        });
        const topProduct = salesProducts.length > 0 ? salesProducts[0].name : 'None';

        // Revenue Over Time
        const revenueChartQuery = `
            SELECT DATE(sale_date) as dt, SUM(total_amount) as daily_revenue
            FROM sales
            WHERE DATE(sale_date) >= $1 AND DATE(sale_date) <= $2
            ${(role === 'manager' || branchId) ? 'AND branch_id = ' + (branchId) : ''}
            GROUP BY DATE(sale_date)
            ORDER BY DATE(sale_date) ASC
        `;
        const revChartRes = await db.query(revenueChartQuery, [date_from, date_to]);
        let revenueChartDates = revChartRes.rows.map(r => r.dt.toISOString().split('T')[0]);
        let revenueChartData = revChartRes.rows.map(r => parseFloat(r.daily_revenue));
        if (revenueChartDates.length === 0) {
            revenueChartDates = [date_from, date_to];
            revenueChartData = [0, 0];
        }
    } catch (error) {
        console.error('Report Generation Error:', error);
        req.flash('error', 'An error occurred while generating the report');
        return res.redirect('/dashboard');
    }
};

        // 2. Inventory Report Data
exports.downloadPdf = async (req, res) => {
    try {
        const role = req.session.user.role;
        if (role !== 'director') return res.status(403).send('Unauthorized');
        
        let { date_from, date_to } = req.query;
        if (!date_from) date_from = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
        if (!date_to) date_to = new Date().toISOString().split('T')[0];

        // Fetch Branch Performance data
        const bpQuery = `
            SELECT b.name as branch_name,
                   COALESCE((SELECT SUM(total_amount) FROM sales WHERE branch_id = b.id AND DATE(sale_date) >= $1 AND DATE(sale_date) <= $2), 0) as revenue,
                   COALESCE((SELECT SUM(quantity_received * unit_cost) FROM procurement WHERE branch_id = b.id AND DATE(created_at) >= $1 AND DATE(created_at) <= $2), 0) as proc_cost,
                   COALESCE((SELECT SUM(i.quantity_available * p.cost_price) FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = b.id), 0) as inv_value,
                   COALESCE((SELECT COUNT(*) FROM sales WHERE branch_id = b.id AND DATE(sale_date) >= $1 AND DATE(sale_date) <= $2), 0) as trans_count
            FROM branches b
            WHERE b.status = 'active'
            ORDER BY revenue DESC
        `;
        const bpRes = await db.query(bpQuery, [date_from, date_to]);

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=branch-performance-${date_from}-to-${date_to}.pdf`);
        doc.pipe(res);

        doc.font('Helvetica-Bold').fontSize(20).text('CROWN STORES', { align: 'center' });
        doc.fontSize(14).text('Branch Performance Report', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text(`Period: ${date_from} to ${date_to}`, { align: 'center' });
        doc.moveDown(2);

        // Table Header
        const colStart = [50, 150, 250, 350, 450];
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('Branch', colStart[0], doc.y, { continued: false });
        doc.text('Revenue (UGX)', colStart[1], doc.y - doc.currentLineHeight(), { continued: false });
        doc.text('Proc. Cost', colStart[2], doc.y - doc.currentLineHeight(), { continued: false });
        doc.text('Inv. Value', colStart[3], doc.y - doc.currentLineHeight(), { continued: false });
        doc.text('Transactions', colStart[4], doc.y - doc.currentLineHeight(), { continued: false });
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // Table Rows
        doc.font('Helvetica');
        let totalRev = 0, totalProc = 0, totalInv = 0, totalTrans = 0;
        
        for (const r of bpRes.rows) {
            const rev = parseFloat(r.revenue);
            const proc = parseFloat(r.proc_cost);
            const inv = parseFloat(r.inv_value);
            const trans = parseInt(r.trans_count);
            
            totalRev += rev; totalProc += proc; totalInv += inv; totalTrans += trans;

            doc.text(r.branch_name, colStart[0], doc.y);
            doc.text(rev.toLocaleString(), colStart[1], doc.y - doc.currentLineHeight());
            doc.text(proc.toLocaleString(), colStart[2], doc.y - doc.currentLineHeight());
            doc.text(inv.toLocaleString(), colStart[3], doc.y - doc.currentLineHeight());
            doc.text(trans.toString(), colStart[4], doc.y - doc.currentLineHeight());
            doc.moveDown(0.5);
        }

        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold');
        doc.text('TOTAL', colStart[0], doc.y);
        doc.text(totalRev.toLocaleString(), colStart[1], doc.y - doc.currentLineHeight());
        doc.text(totalProc.toLocaleString(), colStart[2], doc.y - doc.currentLineHeight());
        doc.text(totalInv.toLocaleString(), colStart[3], doc.y - doc.currentLineHeight());
        doc.text(totalTrans.toString(), colStart[4], doc.y - doc.currentLineHeight());

        doc.end();
    } catch (error) {
        console.error('PDF Export Error:', error);
        res.status(500).send('Error generating PDF');
    }
};

