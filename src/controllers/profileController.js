const bcrypt = require('bcryptjs'); // أو bcrypt حسب اللي مثبت عندك
const db = require('../config/db');

exports.getProfilePage = async (req, res) => {
    try {
        // بنجيب بيانات اليوزر اللي مسجل دخول أسي
        const user = req.session.user || req.user;
        
        if (!user) {
            return res.redirect('/login');
        }

        res.render('pages/profile/index', { 
            title: 'My Profile',
            user: user 
        });
    } catch (error) {
        console.error('Profile Load Error:', error);
        res.status(500).send('error loading profile page');
    }
};


exports.getChangePasswordPage = (req, res) => {
    res.render('pages/profile/password', { 
        title: 'Change Password', 
        error: null, 
        success: null 
    });
};

exports.postChangePassword = async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    if (!req.session.user && !req.user) {
        return res.redirect('/login');
    }
    const userId = req.session.user ? req.session.user.id : req.user.id;

    try {
        // 1. التأكد إن كلمات المرور الجديدة متطابقة
        if (newPassword !== confirmPassword) {
            return res.render('pages/profile/password', { 
                title: 'Change Password', 
                error: 'New password and confirmation do not match!', 
                success: null 
            });
        }

        // 2. نجيب الباسورد المشفر القديم من الداتا بيس
        const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).send('User not found');
        }
        const dbPassword = userResult.rows[0].password_hash;

        // 3. نقارن الباسورد اللي دخلو اليوزر بالباسورد الفعلي
        const isMatch = await bcrypt.compare(currentPassword, dbPassword);
        if (!isMatch) {
            return res.render('pages/profile/password', { 
                title: 'Change Password', 
                error: 'current password is incorrect!', 
                success: null 
            });
        }

        // 4. تشفير الباسورد الجديد
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 5. حفظ الباسورد الجديد في الداتا بيس
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

        // 6. إرجاع رسالة نجاح
        res.render('pages/profile/password', { 
            title: 'Change Password', 
            success: 'password changed successfully!', 
            error: null 
        });

    } catch (error) {
        console.error('Password Change Error:', error);
        res.status(500).send('error changing password');
    }
};
