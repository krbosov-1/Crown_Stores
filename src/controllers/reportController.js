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

        // ==========================================
        // 1. Sales Report Data
        // ==========================================
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
        
        let totalRev = parseFloat(salesAggRes.rows[0].total_rev || 0);
        const avgOrderValue = transCount > 0 ? totalRev / transCount : 0;

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

        // ========================
        // 2. Inventory Report Data
        // ========================
        let invQuery = `
            SELECT p.name as product_name, c.name as category_name, i.quantity_available, p.reorder_level, 
                   (i.quantity_available * p.cost_price) as stock_value
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        let invParams = [];
        if (role === 'manager' || (role === 'director' && branchId)) {
            invQuery += ` AND i.branch_id = $1`;
            invParams.push(branchId);
        }
        const invRes = await db.query(invQuery, invParams);
        
        let totalSkus = invRes.rows.length;
        let totalInvValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        const inventoryData = invRes.rows.map(r => {
            let status = 'In Stock';
            if (r.quantity_available <= 0) {
                status = 'Out of Stock';
                outOfStockCount++;
            } else if (r.quantity_available <= r.reorder_level) {
                status = 'Low Stock';
                lowStockCount++;
            }
            totalInvValue += parseFloat(r.stock_value || 0);
            return { ...r, status };
        });

        // ==========================
        // 3. Procurement Report Data
        // ==========================
        let procQuery = `
            SELECT pr.created_at as pr_date, p.name as product_name, s.name as supplier_name, 
                   pr.quantity_received, pr.unit_cost, (pr.quantity_received * pr.unit_cost) as total_cost, u.full_name
            FROM procurement pr
            JOIN products p ON pr.product_id = p.id
            LEFT JOIN suppliers s ON pr.supplier_id = s.id
            LEFT JOIN users u ON pr.received_by = u.id
            WHERE DATE(pr.created_at) >= $1 AND DATE(pr.created_at) <= $2
        `;
        let procParams = [date_from, date_to];
        if (role === 'manager' || (role === 'director' && branchId)) {
            procQuery += ` AND pr.branch_id = $3`;
            procParams.push(branchId);
        }
        const procRes = await db.query(procQuery, procParams);
        
        let totalProcUnits = 0;
        let totalProcCost = 0;
        procRes.rows.forEach(r => {
            totalProcUnits += parseInt(r.quantity_received || 0);
            totalProcCost += parseFloat(r.total_cost || 0);
        });

        // ====================
        // 4. Branch Chart Data
        // ====================
        let branchChartLabels = [];
        let branchChartDataArr = [];
        let branchPerfData = [];
        
        if (role === 'director') {
            const bpQuery = `
                SELECT b.name as branch_name,
                       COALESCE((SELECT SUM(total_amount) FROM sales WHERE branch_id = b.id AND DATE(sale_date) >= $1 AND DATE(sale_date) <= $2), 0) as revenue,
                       COALESCE((SELECT SUM(quantity_received * unit_cost) FROM procurement WHERE branch_id = b.id AND DATE(created_at) >= $1 AND DATE(created_at) <= $2), 0) as proc_cost,
                       COALESCE((SELECT SUM(i.quantity_available * p.cost_price) FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.branch_id = b.id), 0) as inv_value,
                       COALESCE((SELECT COUNT(*) FROM sales WHERE branch_id = b.id AND DATE(sale_date) >= $1 AND DATE(sale_date) <= $2), 0) as trans_count
                FROM branches b WHERE b.status = 'active'
            `;
            const bpRes = await db.query(bpQuery, [date_from, date_to]);
            branchPerfData = bpRes.rows;
            
            branchPerfData.forEach(b => {
                branchChartLabels.push(b.branch_name);
                branchChartDataArr.push(parseFloat(b.revenue));
            });
        }


        res.render('pages/reports/index', {
            title: 'Company Reports',
            role: role,
            filters: { date_from, date_to, branch_id: filterBranch || '' },
            allBranches,
            
            // Sales
            salesSummary: { totalRev, transCount, avgOrderValue, topProduct },
            salesProducts,
            revenueChart: { labels: revenueChartDates, data: revenueChartData },
            
            // Inventory
            invSummary: { totalSkus, totalInvValue, lowStockCount, outOfStockCount },
            inventoryData,
            
            // Procurement
            procSummary: { totalProcurements: procRes.rows.length, totalProcUnits, totalProcCost },
            procurementData: procRes.rows,
            
            cashierData: [],
            
            // Branch
            branchPerfData,
            branchChart: { labels: branchChartLabels, data: branchChartDataArr }
        });

    } catch (error) {
        console.error('Report Generation Error:', error);
        req.flash('error', 'An error occurred while generating the report');
        return res.redirect('/dashboard');
    }
};

// =====================
// PDF Download Function
// =====================
exports.downloadPdf = async (req, res) => {
    try {
        const role = req.session.user.role;
        if (role !== 'director') return res.status(403).send('Unauthorized');
        
        let { date_from, date_to } = req.query;
        if (!date_from) date_from = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
        if (!date_to) date_to = new Date().toISOString().split('T')[0];

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
