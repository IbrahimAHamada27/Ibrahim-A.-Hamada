require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// ===================== SECURITY CONFIG =====================
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'IbrahimA.Hamada';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'IbrahimInDuck2006';
const SECRET_KEY = process.env.SECRET_KEY || 'coffee-duck-super-secret-2025';

// Generate a stable HMAC token from credentials — survives server restarts
function generateToken(username) {
    return crypto.createHmac('sha256', SECRET_KEY).update(username + ADMIN_PASSWORD).digest('hex');
}

// Auth middleware — verifies HMAC token without any stored state
function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (!token || token !== generateToken(ADMIN_USERNAME)) {
        return res.status(401).json({ success: false, message: 'Unauthorized — please log in again' });
    }
    next();
}

const JWT_SECRET = process.env.JWT_SECRET || 'coffee-duck-pos-secret-2025';

function requireRoles(roles) {
    return (req, res, next) => {
        // HMAC Override for backward compatibility with admin-dashboard
        const hmacToken = req.headers['x-auth-token'];
        if (hmacToken && hmacToken === generateToken(ADMIN_USERNAME)) {
            req.user = { id: 0, username: ADMIN_USERNAME, role: 'admin' };
            if (roles.length && !roles.includes('admin')) return res.status(403).json({ success: false, message: 'Forbidden' });
            return next();
        }

        const authHeader = req.headers['authorization'];
        if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
        
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.status(401).json({ success: false, message: 'Invalid token' });
            if (roles.length && !roles.includes(user.role)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            req.user = user;
            next();
        });
    };
}

// ===================== DATABASE =====================
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS corners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imageName TEXT, nameEn TEXT, nameAr TEXT, sortOrder INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cornerId INTEGER, nameEn TEXT, nameAr TEXT, price TEXT, sortOrder INTEGER DEFAULT 0,
        FOREIGN KEY(cornerId) REFERENCES corners(id) ON DELETE CASCADE
    )`);
    db.run(`ALTER TABLE corners ADD COLUMN sortOrder INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE items ADD COLUMN sortOrder INTEGER DEFAULT 0`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, pin TEXT UNIQUE, role TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at DATETIME DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME, opening_cash REAL, closing_cash REAL, status TEXT DEFAULT 'open'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER, status TEXT DEFAULT 'open', total REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, payment_method TEXT, discount_amount REAL DEFAULT 0, notes TEXT, FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, item_id INTEGER, name TEXT, price REAL, qty INTEGER, notes TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS cash_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER, type TEXT, amount REAL, reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )`);
    // Add cashier columns if not exist (safe migration)
    db.run(`ALTER TABLE orders ADD COLUMN cashier_id INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE orders ADD COLUMN cashier_name TEXT DEFAULT 'Unknown'`, () => {});
    db.run(`ALTER TABLE shifts ADD COLUMN cashier_id INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE shifts ADD COLUMN cashier_name TEXT DEFAULT 'Unknown'`, () => {});

    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (!err && row.count === 0) {
            console.log('Seeding default POS users...');
            const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
            const cashierHash = crypto.createHash('sha256').update('cashier123').digest('hex');
            db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', ['admin', adminHash, '0000', 'admin']);
            db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', ['cashier', cashierHash, '1234', 'cashier']);
        }
    });

    db.get('SELECT COUNT(*) as count FROM corners', (err, row) => {
        if (!err && row.count === 0) {
            console.log('Database is empty. Seeding...');
            seedDatabase();
        }
    });
});

function seedDatabase() {
    const cornersData = [
        { imageName: 'espresso.jpeg', nameEn: 'Duck Espresso Corner', nameAr: 'ركن الإسبريسو', items: [['Spanish Latte','سبانش لاتيه','105'],['Latte','لاتيه','80'],['Cappuccino','كابتشينو','90'],['Flat White','فلات وايت','70'],['Mocha','موكا','85'],['Caramel Mocha','كراميل موكا','95'],['Caramel Macchiato','كراميل ماكياتو','95'],['Hot Chocolate','هوت شوكليت','90'],['Dulce De Leche Latte','دولسي دي ليتشي لاتيه','95'],['Espresso (S/D)','إسبريسو (سنجل/دبل)','45 / 55'],['Espresso Macchiato (S/D)','إسبريسو ماكياتو (سنجل/دبل)','50 / 60'],['Cortado','كورتادو','65'],['Americano (M/L)','أمريكانو (وسط/كبير)','60 / 70'],['Hot Chocolate Marshmallow','هوت شوكليت مارشميلو','120']] },
        { imageName: 'hot1.jpeg', nameEn: 'Duck Hot Corner', nameAr: 'مشروبات ساخنة', items: [['English Tea (M/L)','شاي إنجليزي (وسط/كبير)','40 / 50'],['Green Tea (M/L)','شاي أخضر (وسط/كبير)','40 / 50'],['Earl Grey Tea (M/L)','شاي إيرل جراي (وسط/كبير)','40 / 50'],['Anise (M/L)','يانسون (وسط/كبير)','35 / 45'],['Roselle (M/L)','كركديه (وسط/كبير)','35 / 45'],['Mint (M/L)','نعناع (وسط/كبير)','35 / 45'],['Lemon Ginger (M/L)','ليمون بالزنجبيل (وسط/كبير)','35 / 45'],['Herbs (M/L)','أعشاب (وسط/كبير)','50 / 60'],['Flavored Tea (M/L)','شاي بنكهات (وسط/كبير)','50 / 60']] },
        { imageName: 'hot.jpeg', nameEn: 'Duck Hot Corner 2', nameAr: 'مشروبات ساخنة 2', items: [['Tea With Milk (M/L)','شاي بحليب (وسط/كبير)','50 / 60'],['Nescafe With Milk (M/L)','نسكافيه بالحليب (وسط/كبير)','50 / 65'],['Nescafe Black','نسكافيه بلاك','35 / 50'],['Hot Cider','هوت سيدر','80'],['Cinnamon With Milk','قرفة بالحليب','50 / 60'],['Sahlab Nuts','سحلب بالمكسرات','75'],['Karak Tea','شاي كرك','70']] },
        { imageName: 'coffee.jpeg', nameEn: 'Duck Coffee Corner', nameAr: 'ركن القهوة', items: [['Turkish Coffee (S/D)','قهوة تركي (سنجل/دبل)','40 / 60'],['French Coffee (S/D)','قهوة فرنساوي (سنجل/دبل)','45 / 65'],['Hazelnut Coffee (S/D)','قهوة بالبندق (سنجل/دبل)','50 / 70'],['Nutella Coffee (S/D)','قهوة نوتيلا (سنجل/دبل)','55 / 75']] },
        { imageName: 'iced.jpeg', nameEn: 'Duck Iced Corner', nameAr: 'ركن المثلجات', items: [['Ice Latte','أيس لاتيه','90'],['Ice Chocolate','أيس شوكليت','90'],['Ice Mocha','أيس موكا','95'],['Ice Dulce De Leche','أيس دولسي دي ليتشي','95'],['Ice Spanish Latte','أيس سبانش لاتيه','105'],['Ice Caramel Macchiato','أيس كراميل ماكياتو','95'],['Ice Americano','أيس أمريكانو','70']] },
        { imageName: 'frappe.jpeg', nameEn: 'Duck Frappe Corner', nameAr: 'ركن الفرابيه', items: [['Caramel Frappe','فرابيه كراميل','95'],['Vanilla Frappe','فرابيه فانيليا','95'],['Hazelnut Frappe','فرابيه بندق','95'],['Mocha Frappe','فرابيه موكا','95'],['Dulce De Leche Frappe','فرابيه دولسي دي ليتشي','95'],['Strawberry Frappe','فرابيه فراولة','95'],['Peach Frappe','فرابيه خوخ','95'],['Oreo Frappe','فرابيه أوريو','95'],['Spanish Frappe','فرابيه سبانش','105'],['Peanut Butter Frappe','فرابيه زبدة الفول السوداني','105']] },
        { imageName: 'yogurt.jpeg', nameEn: 'Duck Yogurt Corner', nameAr: 'ركن الزبادي', items: [['Strawberry Yogurt','زبادي فراولة','90'],['Peach Yogurt','زبادي خوخ','90'],['Kiwi Yogurt','زبادي كيوي','90'],['Mango Yogurt','زبادي مانجو','90'],['Blueberry Yogurt','زبادي توت أزرق','90'],['Honey Yogurt','زبادي عسل','90'],['Passion Fruit Yogurt','زبادي باشن فروت','90']] },
        { imageName: 'smoothies.jpeg', nameEn: 'Duck Smoothies Corner', nameAr: 'ركن السموذي', items: [['Blueberry Smoothie','سموذي توت أزرق','80'],['Mango Smoothie','سموذي مانجو','80'],['Strawberry Smoothie','سموذي فراولة','80'],['Peach Smoothie','سموذي خوخ','80'],['Pineapple Smoothie','سموذي أناناس','80'],['Kiwi Smoothie','سموذي كيوي','80'],['Passion Fruit Smoothie','سموذي باشن فروت','80'],['Pinaculada Smoothie','سموذي بينا كولادا','80']] },
        { imageName: 'soda.jpeg', nameEn: 'Duck Soda Corner', nameAr: 'ركن الصودا', items: [['Redbull','ريدبول','85'],['Cherry Cola','شيري كولا','80'],['Jelly Cola','جيلي كولا','80'],['Mojito','موهيتو','80'],['Sunshine','صن شاين','80'],['Soft Drinks','مشروبات غازية','45'],['Mineral Water','مياه معدنية','10']] },
        { imageName: 'juice.jpeg', nameEn: 'Duck Juice Corner', nameAr: 'عصائر فريش', items: [['Mango','مانجو','80'],['Strawberry','فراولة','70'],['Orange','برتقال','70'],['Guava','جوافة','70'],['Tangerine','يوسفي','70'],['Banana With Milk','موز باللبن','70'],['Guava With Milk','جوافة باللبن','70'],['Lemon Mint','ليمون نعناع','70']] },
        { imageName: 'boba.jpeg', nameEn: 'Duck Boba Corner', nameAr: 'ركن البوبا', items: [['Blueberry Boba','بوبا توت أزرق','90'],['Strawberry Boba','بوبا فراولة','90'],['Passion Fruit Boba','بوبا باشن فروت','90']] },
        { imageName: '', nameEn: 'Duck Extras', nameAr: 'إضافات', items: [['Extra Espresso','إضافه إسبريسو','30'],['Extra Flavor','إضافة نكهة','20'],['Extra Milk','إضافة حليب','20'],['Extra Sauce','إضافة صوص','20'],['Extra Boba','إضافة بوبا','35']] },
        { imageName: 'dessert.jpeg', nameEn: 'Desserts', nameAr: 'حلويات', items: [['Cookies','كوكيز','45'],['Brownies','براونيز','55'],['Chocolate Cheese Cake','تشيز كيك شوكولاتة','80'],['Strawberry Cheese Cake','تشيز كيك فراولة','80'],['Lotus Cheese Cake','تشيز كيك لوتس','85'],['Ding Dong Cake','دينج دونج كيك','65'],['Chocolate Muffin','مافن شوكولاتة','45'],['Chocolate Cake','كيك شوكولاتة','75'],['Lava Cake','لافا كيك','120']] },
        { imageName: 'playstation.jpeg', nameEn: 'Playstation Corner', nameAr: 'ركن البلايستيشن', items: [['PS5 - Single','بلايستيشن 5 - فردي','80'],['PS5 - Multiplayer','بلايستيشن 5 - جماعي','110'],['PS4 - Single','بلايستيشن 4 - فردي','60'],['PS4 - Multiplayer','بلايستيشن 4 - جماعي','90']] },
    ];

    const insertCorner = db.prepare('INSERT INTO corners (imageName, nameEn, nameAr, sortOrder) VALUES (?, ?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO items (cornerId, nameEn, nameAr, price, sortOrder) VALUES (?, ?, ?, ?, ?)');
    cornersData.forEach((corner, ci) => {
        insertCorner.run(corner.imageName, corner.nameEn, corner.nameAr, ci, function() {
            const cornerId = this.lastID;
            corner.items.forEach((item, ii) => insertItem.run(cornerId, item[0], item[1], item[2], ii));
        });
    });
    console.log('Database seeded successfully!');
}

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Rate limiter for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ===================== API ENDPOINTS =====================

// 1. Admin Login (rate limited)
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = generateToken(username);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// 1b. Verify token is still valid
app.get('/api/verify', requireAuth, (req, res) => {
    res.json({ success: true });
});

// 2. Admin Logout (stateless — just clear client-side)
app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// 3. Fetch All Corners (PUBLIC — no auth needed)
app.get('/api/corners', (req, res) => {
    db.all('SELECT * FROM corners ORDER BY sortOrder ASC, id ASC', [], (err, corners) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all('SELECT * FROM items ORDER BY sortOrder ASC, id ASC', [], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(corners.map(corner => ({ ...corner, items: items.filter(i => i.cornerId === corner.id) })));
        });
    });
});

// ---- Protected routes below ----

// 4. Reorder Corners
app.put('/api/corners/reorder', requireAuth, (req, res) => {
    const { ids } = req.body;
    const stmt = db.prepare('UPDATE corners SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

// 5. Add Corner
app.post('/api/corners', requireAuth, (req, res) => {
    const { imageName, nameEn, nameAr } = req.body;
    db.run('INSERT INTO corners (imageName, nameEn, nameAr) VALUES (?, ?, ?)', [imageName, nameEn, nameAr], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, imageName, nameEn, nameAr });
    });
});

// 6. Delete Corner
app.delete('/api/corners/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM items WHERE cornerId = ?', [req.params.id], () => {
        db.run('DELETE FROM corners WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// 7. Reorder Items
app.put('/api/items/reorder', requireAuth, (req, res) => {
    const { ids } = req.body;
    const stmt = db.prepare('UPDATE items SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

// 8. Add Item
app.post('/api/items', requireAuth, (req, res) => {
    const { cornerId, nameEn, nameAr, price } = req.body;
    db.run('INSERT INTO items (cornerId, nameEn, nameAr, price) VALUES (?, ?, ?, ?)', [cornerId, nameEn, nameAr, price], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, cornerId, nameEn, nameAr, price });
    });
});

// 9. Update Item
app.put('/api/items/:id', requireAuth, (req, res) => {
    const { nameEn, nameAr, price } = req.body;
    db.run('UPDATE items SET nameEn = ?, nameAr = ?, price = ? WHERE id = ?', [nameEn, nameAr, price, req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// 10. Delete Item
app.delete('/api/items/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM items WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===================== POS API ENDPOINTS =====================

// POS Login
app.post('/api/pos/login', loginLimiter, (req, res) => {
    const { pin, password, username } = req.body;
    let query, params;
    
    if (pin) {
        query = 'SELECT * FROM users WHERE pin = ?';
        params = [pin];
    } else if (username && password) {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?';
        params = [username, hash];
    } else {
        return res.status(400).json({ success: false, message: 'Invalid login format' });
    }

    db.get(query, params, (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
    });
});

app.get('/api/pos/verify', requireRoles([]), (req, res) => {
    res.json({ success: true, user: req.user });
});

// Users Management (Admin)
app.get('/api/users', requireRoles(['admin']), (req, res) => {
    db.all('SELECT id, username, role, pin FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', requireRoles(['admin']), (req, res) => {
    const { username, password, pin, role } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', [username, hash, pin, role], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.delete('/api/users/:id', requireRoles(['admin']), (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], err => {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// Shifts — Per Cashier System
// Each cashier has their own independent shift
app.post('/api/shifts/open', requireRoles(['admin', 'cashier']), (req, res) => {
    const { opening_cash } = req.body;
    const cashierId   = req.user?.id || 0;
    const cashierName = req.user?.username || 'Unknown';

    db.get('SELECT * FROM shifts WHERE status = "open" AND cashier_id = ?', [cashierId], (err, existing) => {
        if (existing) return res.status(400).json({ success: false, message: 'You already have an open shift' });
        db.run('INSERT INTO shifts (opening_cash, cashier_id, cashier_name) VALUES (?, ?, ?)',
            [opening_cash || 0, cashierId, cashierName], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM shifts WHERE id = ?', [this.lastID], (err, shift) => {
                res.json({ success: true, shift });
            });
        });
    });
});

app.post('/api/shifts/close', requireRoles(['admin', 'cashier']), (req, res) => {
    const { closing_cash, shift_id } = req.body;
    const cashierId = req.user?.id || 0;
    const role      = req.user?.role || 'cashier';

    // Admin can close any shift; cashier can only close their own
    const whereClause = role === 'admin'
        ? (shift_id ? 'WHERE id = ? AND status = "open"' : 'WHERE status = "open" AND cashier_id = ?')
        : 'WHERE status = "open" AND cashier_id = ?';
    const param = (role === 'admin' && shift_id) ? shift_id : cashierId;

    db.get(`SELECT * FROM shifts ${whereClause}`, [param], (err, shift) => {
        if (!shift) return res.status(400).json({ success: false, message: 'No open shift found for you' });
        db.run('UPDATE shifts SET closed_at = CURRENT_TIMESTAMP, closing_cash = ?, status = "closed" WHERE id = ?',
            [closing_cash || 0, shift.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, shift_id: shift.id });
        });
    });
});

// Get current cashier's open shift
app.get('/api/shifts/current', requireRoles(['admin', 'cashier']), (req, res) => {
    const cashierId = req.user?.id || 0;
    const role      = req.user?.role || 'cashier';
    // Admin sees any open shift; cashier sees their own
    const query = role === 'admin'
        ? 'SELECT * FROM shifts WHERE status = "open" ORDER BY id DESC LIMIT 1'
        : 'SELECT * FROM shifts WHERE status = "open" AND cashier_id = ? LIMIT 1';
    const params = role === 'admin' ? [] : [cashierId];
    db.get(query, params, (err, shift) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, shift: shift || null });
    });
});

// Get ALL shifts (Admin only) — for dashboard
app.get('/api/shifts/all', requireRoles(['admin']), (req, res) => {
    db.all('SELECT * FROM shifts ORDER BY id DESC LIMIT 100', [], (err, shifts) => {
        if (err) return res.status(500).json({ error: err.message });
        // Attach summary stats to each shift
        const shiftIds = shifts.map(s => s.id);
        if (!shiftIds.length) return res.json([]);
        db.all(`SELECT shift_id,
                COUNT(*) as orderCount,
                COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0) as totalSales,
                COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Cash' THEN total ELSE 0 END),0) as cashSales,
                COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Card' THEN total ELSE 0 END),0) as cardSales
                FROM orders WHERE shift_id IN (${shiftIds.map(()=>'?').join(',')}) GROUP BY shift_id`,
            shiftIds, (err, stats) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(shifts.map(s => ({ ...s, ...( stats.find(st=>st.shift_id===s.id) || {orderCount:0,totalSales:0,cashSales:0,cardSales:0}) })));
        });
    });
});

// Cashier daily stats (today's performance for logged-in cashier)
app.get('/api/cashier/stats', requireRoles(['admin', 'cashier']), (req, res) => {
    const cashierId = req.user?.id || 0;
    const startOfDay = "datetime('now', 'start of day')";
    db.get(`SELECT
        COUNT(*) as totalOrders,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0) as totalSales,
        COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Cash' THEN total ELSE 0 END),0) as cashSales,
        COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Card' THEN total ELSE 0 END),0) as cardSales,
        COUNT(CASE WHEN status='paid' THEN 1 END) as paidOrders
        FROM orders WHERE cashier_id = ? AND created_at >= ${startOfDay}`,
        [cashierId], (err, stats) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, stats });
    });
});

app.post('/api/shifts/cash-movement', requireRoles(['admin', 'cashier']), (req, res) => {
    const { shift_id, type, amount, reason } = req.body;
    db.run('INSERT INTO cash_movements (shift_id, type, amount, reason) VALUES (?, ?, ?, ?)', [shift_id, type, amount, reason], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/shifts/current/movements', requireRoles(['admin', 'cashier']), (req, res) => {
    const cashierId = req.user?.id || 0;
    const role      = req.user?.role || 'cashier';
    const query = role === 'admin'
        ? 'SELECT id FROM shifts WHERE status = "open" ORDER BY id DESC LIMIT 1'
        : 'SELECT id FROM shifts WHERE status = "open" AND cashier_id = ? LIMIT 1';
    const params = role === 'admin' ? [] : [cashierId];
    
    db.get(query, params, (err, shift) => {
        if (err || !shift) return res.json([]);
        db.all('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id DESC', [shift.id], (err, movs) => {
            res.json(movs || []);
        });
    });
});

app.get('/api/movements/recent', requireRoles(['admin']), (req, res) => {
    db.all(`SELECT cm.*, s.cashier_name FROM cash_movements cm 
            LEFT JOIN shifts s ON cm.shift_id = s.id 
            ORDER BY cm.id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Orders (POS)
app.post('/api/orders', requireRoles(['admin', 'cashier']), (req, res) => {
    const { shift_id, status, total, payment_method, discount_amount, notes, items } = req.body;
    const cashierName = req.user?.username || 'Unknown';
    const cashierId   = req.user?.id || 0;
    
    db.run('INSERT INTO orders (shift_id, status, total, payment_method, discount_amount, notes, cashier_id, cashier_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [shift_id, status || 'open', total, payment_method, discount_amount || 0, notes, cashierId, cashierName], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const orderId = this.lastID;
        
        if (items && items.length > 0) {
            const stmt = db.prepare('INSERT INTO order_items (order_id, item_id, name, price, qty, notes) VALUES (?, ?, ?, ?, ?, ?)');
            items.forEach(item => {
                stmt.run(orderId, item.item_id, item.name, item.price, item.qty, item.notes);
            });
            stmt.finalize();
        }
        res.json({ success: true, order_id: orderId });
    });
});

// Orders for a specific shift (Admin + Cashier)
app.get('/api/orders/shift/:shiftId', requireRoles(['admin', 'cashier']), (req, res) => {
    const shiftId = req.params.shiftId;
    db.all('SELECT * FROM orders WHERE shift_id = ? ORDER BY id DESC', [shiftId], (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });
        if (orders.length === 0) return res.json([]);
        const orderIds = orders.map(o => o.id);
        db.all(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(()=>'?').join(',')})`, orderIds, (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(orders.map(o => ({ ...o, items: items.filter(i => i.order_id === o.id) })));
        });
    });
});

// Reports endpoint — period: daily | weekly | monthly | annual
app.get('/api/reports', requireRoles(['admin']), (req, res) => {
    const period = req.query.period || 'daily';
    let dateFilter;
    switch(period) {
        case 'weekly':  dateFilter = "datetime('now', '-7 days')"; break;
        case 'monthly': dateFilter = "datetime('now', '-1 month')"; break;
        case 'annual':  dateFilter = "datetime('now', '-1 year')"; break;
        default:        dateFilter = "datetime('now', 'start of day')";
    }

    const baseWhere = `WHERE status = 'paid' AND created_at >= ${dateFilter}`;

    db.get(`SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalSales,
            COALESCE(SUM(CASE WHEN payment_method='Cash' THEN total ELSE 0 END),0) as cashSales,
            COALESCE(SUM(CASE WHEN payment_method='Card' THEN total ELSE 0 END),0) as cardSales
            FROM orders ${baseWhere}`, [], (err, summary) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`SELECT cashier_name, cashier_id,
                COUNT(*) as orderCount,
                COALESCE(SUM(total),0) as totalSales,
                COALESCE(SUM(CASE WHEN payment_method='Cash' THEN total ELSE 0 END),0) as cashSales,
                COALESCE(SUM(CASE WHEN payment_method='Card' THEN total ELSE 0 END),0) as cardSales
                FROM orders ${baseWhere}
                GROUP BY cashier_name ORDER BY totalSales DESC`, [], (err, byCashier) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(`SELECT o.id, o.created_at, o.total, o.payment_method, o.cashier_name, o.discount_amount,
                    o.shift_id, GROUP_CONCAT(oi.qty || 'x ' || oi.name, ', ') as itemsSummary
                    FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id
                    ${baseWhere} GROUP BY o.id ORDER BY o.id DESC LIMIT 200`, [], (err, orders) => {
                if (err) return res.status(500).json({ error: err.message });

                // Also fetch Cash Movements for this period
                db.all(`SELECT cm.*, s.cashier_name FROM cash_movements cm
                        LEFT JOIN shifts s ON cm.shift_id = s.id
                        WHERE cm.created_at >= ${dateFilter} ORDER BY cm.id DESC`, [], (err, movements) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0);
                    const totalOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0);

                    res.json({ period, summary, byCashier, orders, movements, totalIn, totalOut });
                });
            });
        });
    });
});

app.get('/api/orders/active', requireRoles(['admin', 'cashier']), (req, res) => {
    db.all('SELECT * FROM orders WHERE status IN ("open", "held") ORDER BY id DESC', [], (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all('SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ("open", "held"))', [], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const ordersWithItems = orders.map(o => ({
                ...o,
                items: items.filter(i => i.order_id === o.id)
            }));
            res.json(ordersWithItems);
        });
    });
});

app.put('/api/orders/:id/status', requireRoles(['admin', 'cashier']), (req, res) => {
    const { status, payment_method } = req.body;
    db.run('UPDATE orders SET status = ?, payment_method = COALESCE(?, payment_method) WHERE id = ?', [status, payment_method, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Z-Report (Admin only)
app.get('/api/shifts/:id/report', requireRoles(['admin']), (req, res) => {
    const shiftId = req.params.id;
    db.get('SELECT * FROM shifts WHERE id = ?', [shiftId], (err, shift) => {
        if (err || !shift) return res.status(404).json({ error: 'Shift not found' });
        
        db.all('SELECT status, COUNT(*) as count, SUM(total) as totalSum FROM orders WHERE shift_id = ? GROUP BY status', [shiftId], (err, orderStats) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.all('SELECT type, SUM(amount) as totalSum FROM cash_movements WHERE shift_id = ? GROUP BY type', [shiftId], (err, movementStats) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({ shift, orderStats, movementStats });
            });
        });
    });
});

// ===================== HTML ROUTES =====================
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/cashier.html', (req, res) => res.sendFile(path.join(__dirname, 'cashier.html')));
app.get('/cashier', (req, res) => res.sendFile(path.join(__dirname, 'cashier.html')));
app.get('/admin-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));
app.get('/admin-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => console.log(`Coffee Duck Server running at http://localhost:${port}`));
