require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const engine = require('ejs-mate');

const app = express();

// Set trust proxy to fix express-rate-limit behind a reverse proxy
app.set('trust proxy', 1);

// 1. helmet() with CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    xFrameOptions: { action: 'sameorigin' }
}));

// 2. express.json() + express.urlencoded({ extended: true })
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. express.static('public')
app.use(express.static(path.join(__dirname, 'public')));

// 4. session config
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_super_secret_key_here',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// 5. connect-flash setup
app.use(flash());

// 6. res.locals middleware
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = req.flash();
    res.locals.currentPath = req.path;
    res.locals.path = req.path;
    res.locals.unreadCount = 0; // will be dynamically overridden if needed on client side or route
    next();
});

// 7. ejs-mate as view engine, views folder set
app.engine('ejs', engine);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 8. All route imports and app.use() mounts
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

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

// 9. 404 handler
app.use((req, res, next) => {
    res.status(404).render('pages/errors/404', { message: 'Page Not Found' });
});

// 10. Global error handler (500)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('pages/errors/500', { message: 'Internal Server Error' });
});

// 11. app.listen()
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
