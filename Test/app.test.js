const request = require('supertest');
const app = require('../app');

describe('Global App Tests (System Immunity)', () => {
    
    it('Should return a 404 Not Found page for unknown routes', async () => {
        // الروبوت حيحاول يدخل على رابط وهمي ما موجود في السيستم
        const res = await request(app).get('/this-route-does-not-exist-12345');
        
        // نتوقع إنو السيرفر يرد برمز الخطأ 404
        expect(res.statusCode).toEqual(404);
        
        // نتوقع إنو الصفحة الترجع يكون فيها رسالة 404 أو Page Not Found
        expect(res.text).toMatch(/404|Page Not Found/i);
    });

});