const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/auth');

router.use(isAuthenticated);

router.get('/', notificationController.index);
router.post('/read-all', notificationController.markAllRead);
router.post('/:id/read', notificationController.markRead);
router.get('/api/count', notificationController.getUnreadCount); // Adjusted endpoint to match /api/count, as index.ejs calls might need it

module.exports = router;
