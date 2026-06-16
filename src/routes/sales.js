const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { isAuthenticated } = require('../middleware/auth');

router.use(isAuthenticated);

router.get('/', salesController.index);
router.get('/pos', salesController.showPos);
router.get('/api/search', salesController.searchProduct);
router.post('/', salesController.createSale);

module.exports = router;
