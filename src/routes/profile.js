const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

router.get('/', profileController.getProfilePage);
router.get('/password', profileController.getChangePasswordPage);

router.post('/password', profileController.postChangePassword);

module.exports = router;
