const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const role = req.session.user.role;
        const { date, agent } = req.query;

        // Ensure only managers and directors can view
        if (role === 'sales_agent') {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/dashboard');
        }

        // Fetch agents in branch
        const agentsRes = await db.query(`
            SELECT id, full_name, username 
            FROM users 
            WHERE branch_id = $1 AND role = 'sales_agent' AND status = 'active'
        `, [branchId]);

        const agents = agentsRes.rows;
        let balancingData = null;

        if (date && agent) {
            // Check if already balanced
            const balanceRes = await db.query(`
                SELECT cb.*, u.full_name as manager_name
                FROM cashier_balancing cb
                LEFT JOIN users u ON cb.manager_id = u.id
                WHERE cb.branch_id = $1 AND cb.sales_agent_id = $2 AND cb.balance_date = $3
            `, [branchId, agent, date]);

            // Calculate system total
            const salesRes = await db.query(`
                SELECT id, sale_date, total_amount, amount_paid, change_given,
                       (SELECT COUNT(*) FROM sale_items WHERE sale_id = sales.id) as items_count
                FROM sales
                WHERE branch_id = $1 AND sales_agent_id = $2 AND DATE(sale_date) = $3
                ORDER BY sale_date DESC
            `, [branchId, agent, date]);

            const sales = salesRes.rows;
            const systemTotal = sales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0);
            
            const selectedAgent = agents.find(a => a.id === parseInt(agent, 10));

            balancingData = {
                systemTotal,
                sales,
                selectedAgentName: selectedAgent ? selectedAgent.full_name : 'Unknown Agent',
                alreadyBalanced: balanceRes.rows.length > 0 ? balanceRes.rows[0] : null
            };
        }

        res.render('pages/cashier/index', {
            title: 'Cashier Balancing',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Cashier Balancing', url: '/cashier-balancing' }
            ],
            currentPath: '/cashier-balancing',
            agents,
            filters: { date: date || new Date().toISOString().split('T')[0], agent },
            balancingData
        });

    } catch (error) {
        console.error('Cashier Balancing Error:', error);
        req.flash('error', 'An error occurred loading the cashier balancing page');
        res.redirect('/dashboard');
    }
};

exports.approve = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const managerId = req.session.user.id;
        const { agentId, balanceDate, submittedAmount, notes } = req.body;

        const subAmt = parseFloat(submittedAmount);
        if (isNaN(subAmt)) {
            req.flash('error', 'Invalid submitted amount');
            return res.redirect(`/cashier-balancing?date=${balanceDate}&agent=${agentId}`);
        }

        // Verify agent belongs to same branch
        const agentRes = await db.query('SELECT branch_id FROM users WHERE id = $1', [agentId]);
        if (agentRes.rows.length === 0 || agentRes.rows[0].branch_id !== branchId) {
            req.flash('error', 'Invalid agent selection');
            return res.redirect('/cashier-balancing');
        }

        // Check if already balanced
        const checkRes = await db.query(`
            SELECT id FROM cashier_balancing WHERE branch_id = $1 AND sales_agent_id = $2 AND balance_date = $3
        `, [branchId, agentId, balanceDate]);

        if (checkRes.rows.length > 0) {
            req.flash('error', 'Cashier balancing already completed for this date.');
            return res.redirect(`/cashier-balancing?date=${balanceDate}&agent=${agentId}`);
        }

        // Get system total
        const salesRes = await db.query(`
            SELECT SUM(total_amount) as total FROM sales 
            WHERE branch_id = $1 AND sales_agent_id = $2 AND DATE(sale_date) = $3
        `, [branchId, agentId, balanceDate]);

        const expectedAmt = parseFloat(salesRes.rows[0].total || 0);
        const varianceAmt = subAmt - expectedAmt;

        if (varianceAmt !== 0 && (!notes || notes.trim() === '')) {
            req.flash('error', 'Manager notes are required when there is a variance.');
            return res.redirect(`/cashier-balancing?date=${balanceDate}&agent=${agentId}`);
        }

        await db.query(`
            INSERT INTO cashier_balancing (branch_id, sales_agent_id, manager_id, balance_date, expected_amount, actual_amount, variance_amount, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [branchId, agentId, managerId, balanceDate, expectedAmt, subAmt, varianceAmt, notes?.trim() || null]);

        await db.query(`
            INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [branchId, managerId, 'CASHIER_BALANCE_APPROVED', 'cashier_balancing', agentId, JSON.stringify({
            balance_date: balanceDate, expected: expectedAmt, actual: subAmt, variance: varianceAmt
        })]);

        req.flash('success', 'Daily balance approved successfully');
        res.redirect(`/cashier-balancing?date=${balanceDate}&agent=${agentId}`);

    } catch (error) {
        console.error('Approve Balance Error:', error);
        req.flash('error', 'Error approving daily balance');
        res.redirect('/cashier-balancing');
    }
};
