require('dotenv').config(); 

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const engine = require('ejs-mate');
const compression = require('compression');

const app = express();

// Set trust proxy to fix express-rate-limit behind a reverse proxy
app.set('trust proxy', 1);

// 1. Helmet للحماية
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"]
        },
    },
}));

// 2. Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    message: 'Too many requests from this IP, please try again later.'
});
app.use(globalLimiter);

// 3. Compression
app.use(compression());

// 4. معالجة البيانات
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// 6. الجلسة (Session)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_super_secret_key_here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use(flash());

// 8. الميدل وير الموحد (تم دمج تعريف العملة والـ locals هنا)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = req.flash();
    res.locals.currentPath = req.path;
    res.locals.path = req.path;
    res.locals.unreadCount = 0;

    // إعدادات العملة
    const currencySymbol = process.env.CURRENCY_SYMBOL || 'UGX';
    res.locals.currencySymbol = currencySymbol;
    res.locals.formatMoney = (amount) => {
        if (isNaN(amount) || amount === null) amount = 0;
        const decimals = currencySymbol === 'UGX' ? 0 : 2;
        return `${parseFloat(amount).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        })} ${currencySymbol}`;
    };
    
    next();
});

// 9. إعداد الـ View Engine
app.engine('ejs', engine);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

if (process.env.NODE_ENV === 'production') {
    app.set('view cache', true);
}

// 10. الروابط (Routes)
const authRouter = require('./src/routes/auth');
const dashboardRouter = require('./src/routes/dashboard');
const categoriesRouter = require('./src/routes/categories');
const productsRouter = require('./src/routes/products');
const procurementRouter = require('./src/routes/procurement');
const inventoryRouter = require('./src/routes/inventory');
const salesRouter = require('./src/routes/sales');
const receiptsRouter = require('./src/routes/receipts');
const cashierRouter = require('./src/routes/cashier');
const reportsRouter = require('./src/routes/reports');
const notificationsRouter = require('./src/routes/notifications');
const profileRouter = require('./src/routes/profile');
const usersRouter = require('./src/routes/users'); 

app.use('/', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/categories', categoriesRouter);
app.use('/products', productsRouter);
app.use('/procurement', procurementRouter);
app.use('/inventory', inventoryRouter);
app.use('/sales', salesRouter);
app.use('/receipts', receiptsRouter);
app.use('/cashier-balancing', cashierRouter);
app.use('/reports', reportsRouter);
app.use('/notifications', notificationsRouter);
app.use('/profile', profileRouter);
app.use('/users', usersRouter); 

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

// 11. 404 handler
app.use((req, res, next) => {
    res.status(404).render('pages/errors/404', { message: 'Page Not Found' });
});

// 12. Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('pages/errors/500', { message: 'Internal Server Error' });
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;


app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
});