const express = require('express');
const router = express.Router();
const receiptController = require('../controllers/receiptController');
const { isAuthenticated } = require('../middleware/auth');

router.use(isAuthenticated);

router.get('/:id', receiptController.show);
router.get('/:id/pdf', receiptController.downloadPdf);

module.exports = router;
