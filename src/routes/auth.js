const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { isAuthenticated } = require('../middleware/auth');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per windowMs
    message: 'Too many login attempts, please try again in 15 minutes.',
    handler: (req, res) => {
        req.flash('error', 'Too many login attempts, please try again in 15 minutes.');
        res.redirect('/login');
    }
});

router.get('/login', authController.showLogin);
router.post('/login', loginLimiter, [
    body('username').notEmpty().trim(),
    body('password').notEmpty()
], authController.processLogin);

router.get('/logout', isAuthenticated, authController.logout);

router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', authController.processForgotPassword);

module.exports = router;
