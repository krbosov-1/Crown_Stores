const db = require('../config/db');
const PDFDocument = require('pdfkit');

exports.show = async (req, res) => {
    try {
        const saleId = req.params.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const role = req.session.user.role;
        const userId = req.session.user.id;

        // Fetch sale
        const saleRes = await db.query(`
            SELECT s.*, u.full_name as agent_name, b.name as branch_name, b.location as branch_address
            FROM sales s
            JOIN users u ON s.sales_agent_id = u.id
            JOIN branches b ON s.branch_id = b.id
            WHERE s.id = $1
        `, [saleId]);

        if (saleRes.rows.length === 0) {
            req.flash('error', 'Receipt not found');
            return res.redirect('/sales');
        }

        const sale = saleRes.rows[0];

        // Access check
        if (role === 'sales_agent' && sale.sales_agent_id !== userId) {
            req.flash('error', 'Unauthorized to view this receipt');
            return res.redirect('/sales');
        }
        if (role !== 'director' && sale.branch_id !== branchId) {
             req.flash('error', 'Unauthorized to view this receipt');
             return res.redirect('/sales');
        }

        // Fetch items
        const itemsRes = await db.query(`
            SELECT si.*, p.name as product_name
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = $1
        `, [saleId]);

        res.render('pages/receipts/show', {
            title: `Receipt #${String(sale.id).padStart(6, '0')}`,
            sale: sale,
            items: itemsRes.rows,
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Sales History', url: '/sales' },
                { label: `Receipt #${String(sale.id).padStart(6, '0')}`, url: `/receipts/${sale.id}` }
            ],
            currentPath: '/sales'
        });

    } catch (error) {
        console.error('Receipt Error:', error);
        req.flash('error', 'An error occurred loading the receipt');
        res.redirect('/sales');
    }
};

exports.downloadPdf = async (req, res) => {
    try {
        const saleId = req.params.id;
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const role = req.session.user.role;
        const userId = req.session.user.id;

        const saleRes = await db.query(`
            SELECT s.*, u.full_name as agent_name, b.name as branch_name, b.location as branch_address
            FROM sales s
            JOIN users u ON s.sales_agent_id = u.id
            JOIN branches b ON s.branch_id = b.id
            WHERE s.id = $1
        `, [saleId]);

        if (saleRes.rows.length === 0) {
            return res.status(404).send('Receipt not found');
        }

        const sale = saleRes.rows[0];

        if (role === 'sales_agent' && sale.sales_agent_id !== userId) {
            return res.status(403).send('Unauthorized');
        }
        if (role !== 'director' && sale.branch_id !== branchId) {
             return res.status(403).send('Unauthorized');
        }

        const itemsRes = await db.query(`
            SELECT si.*, p.name as product_name
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = $1
        `, [saleId]);

        const items = itemsRes.rows;

        // Generate PDF
        const doc = new PDFDocument({
            size: [226.77, 800], // 80mm = ~226.77 points
            margin: 15
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=receipt-${saleId}.pdf`);
        doc.pipe(res);

        const centerOptions = { align: 'center', width: doc.page.width - 30 };
        const rightOptions = { align: 'right', width: doc.page.width - 30 };

        // Header
        doc.font('Helvetica-Bold').fontSize(14).text('CROWN STORES', centerOptions);
        doc.font('Helvetica').fontSize(10).text(sale.branch_name, centerOptions);
        doc.fontSize(8).text(sale.branch_address || '', centerOptions);
        doc.moveDown(0.5);
        
        // Dashed line
        drawDashedLine(doc);
        doc.moveDown(0.5);

        // Meta
        doc.fontSize(9).text(`Receipt #: ${String(sale.id).padStart(6, '0')}`);
        doc.text(`Date & Time: ${new Date(sale.sale_date).toLocaleString()}`);
        doc.text(`Cashier: ${sale.agent_name}`);
        doc.moveDown(0.5);

        // Dashed line
        drawDashedLine(doc);
        doc.moveDown(0.5);

        // Items header
        doc.font('Helvetica-Bold').fontSize(9);
        const startY = doc.y;
        doc.text('Qty', 15, startY);
        doc.text('Product', 45, startY);
        doc.text('Amount', 15, startY, { align: 'right', width: doc.page.width - 30 });
        doc.moveDown(0.5);

        // Items
        doc.font('Helvetica');
        for (const item of items) {
            const y = doc.y;
            doc.text(`${item.quantity}x`, 15, y);
            
            // Limit product name width
            doc.text(item.product_name, 45, y, { width: 100 });
            
            const sub = parseFloat(item.subtotal).toLocaleString('en-UG');
            doc.text(sub, 15, y, { align: 'right', width: doc.page.width - 30 });
            doc.moveDown(0.2);
        }
        
        doc.moveDown(0.5);
        drawDashedLine(doc);
        doc.moveDown(0.5);

        // Totals
        const totalPaid = parseFloat(sale.amount_paid).toLocaleString('en-UG');
        const totalChange = parseFloat(sale.change_given).toLocaleString('en-UG');
        const subtotal = parseFloat(sale.total_amount).toLocaleString('en-UG');

        doc.text('Subtotal:', 15, doc.y);
        doc.text(subtotal, 15, doc.y - doc.currentLineHeight(), rightOptions);
        
        doc.font('Helvetica-Bold').fontSize(11).text('TOTAL:', 15, doc.y + 5);
        doc.text(subtotal, 15, doc.y - doc.currentLineHeight(), rightOptions);
        doc.moveDown(0.5);
        
        doc.font('Helvetica').fontSize(9).text('Amount Paid:', 15, doc.y);
        doc.text(totalPaid, 15, doc.y - doc.currentLineHeight(), rightOptions);

        doc.text('Change:', 15, doc.y);
        doc.text(totalChange, 15, doc.y - doc.currentLineHeight(), rightOptions);

        doc.moveDown(1);
        drawDashedLine(doc);
        doc.moveDown(1);

        // Footer
        doc.font('Helvetica-Oblique').fontSize(8).text('Thank you for shopping at Crown Stores!', centerOptions);
        doc.text('Crown Stores — Quality You Can Trust', centerOptions);

        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).send('Error generating PDF');
    }
};

function drawDashedLine(doc) {
    doc.lineWidth(1)
       .dash(3, { space: 3 })
       .moveTo(15, doc.y)
       .lineTo(doc.page.width - 15, doc.y)
       .stroke()
       .undash();
}
