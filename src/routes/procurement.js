const express = require('express');
const router = express.Router();
const procurementController = require('../controllers/procurementController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(isAuthenticated, requireRole('manager'));

router.get('/', procurementController.index);
router.get('/new', procurementController.showCreate);
router.post('/', procurementController.create);
router.get('/api/search', procurementController.searchProducts);

module.exports = router;
