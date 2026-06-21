const request = require('supertest');
const app = require('../app'); // استدعاء السيرفر بتاعنا

describe('Authentication System Tests', () => {
    
    // 1. اختبار هل صفحة تسجيل الدخول بتفتح أساساً؟
    it('Should load the login page correctly (GET /login)', async () => {
        const res = await request(app).get('/login');
        
        // نتوقع إنو الرد يكون 200 (يعني الصفحة فتحت بنجاح)
        expect(res.statusCode).toEqual(200);
        // نتوقع إنو الصفحة فيها كلمة Sign In
        expect(res.text).toContain('Sign In'); 
    });

    // 2. اختبار الحماية: محاولة الدخول ببيانات غلط
    it('Should reject invalid credentials (POST /login)', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: 'hacker',
                password: 'wrongpassword123'
            });
        
        // نتوقع إنو السيرفر يعمل إعادة توجيه (Redirect 302) لصفحة اللوجن تاني
        expect(res.statusCode).toEqual(302);
        // نتوقع إنو التوجيه يكون للرابط /login
        expect(res.headers.location).toBe('/login');
    });

    // 3. اختبار حماية الروابط: محاولة دخول الداشبورد بدون تسجيل دخول
    it('Should redirect unauthenticated users away from protected routes (GET /dashboard)', async () => {
        const res = await request(app).get('/dashboard');
        
        // نتوقع إنو السيرفر يعمل إعادة توجيه (Redirect 302)
        expect(res.statusCode).toEqual(302);
        // نتوقع إنو التوجيه يكون لصفحة اللوجن حصراً
        expect(res.headers.location).toBe('/login');
    });

});