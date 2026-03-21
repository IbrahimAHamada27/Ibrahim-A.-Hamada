require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const fs = require('fs');

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

const JWT_SECRET = process.env.JWT_SECRET || 'coffee-duck-pos-secret-v2';

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
    // Removed strict shifts references, orders and movements now use cashier_id directly
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT DEFAULT 'open', total REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, payment_method TEXT, discount_amount REAL DEFAULT 0, notes TEXT, cashier_id INTEGER DEFAULT 0, cashier_name TEXT DEFAULT '', order_type TEXT DEFAULT 'Takeaway'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, item_id INTEGER, name TEXT, price REAL, qty INTEGER, notes TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS cash_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, amount REAL, reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, cashier_id INTEGER DEFAULT 0, cashier_name TEXT DEFAULT 'Unknown'
    )`);

    // Add new columns to existing tables securely without crashing if they exist
    db.run(`ALTER TABLE orders ADD COLUMN cashier_id INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE orders ADD COLUMN cashier_name TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'Takeaway'`, () => {});
    db.run(`ALTER TABLE cash_movements ADD COLUMN cashier_id INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE cash_movements ADD COLUMN cashier_name TEXT DEFAULT 'Unknown'`, () => {});
    db.run(`ALTER TABLE orders ADD COLUMN service_charge REAL DEFAULT 0`, () => {});

    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (!err && row.count === 0) {
            console.log('Seeding default POS users...');
            const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
            const cashierHash = crypto.createHash('sha256').update('cashier123').digest('hex');
            db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', ['admin', adminHash, crypto.randomUUID(), 'admin']);
            db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', ['cashier', cashierHash, crypto.randomUUID(), 'cashier']);
        }
    });

    db.get('SELECT COUNT(*) as count FROM corners', (err, row) => {
        if (!err && row.count === 0) {
            console.log('Database is empty. You can now use seed.js to populate it!');
        }
    });
});

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ===================== API ENDPOINTS =====================

// 1. Admin Login 
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = generateToken(username);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/verify', requireAuth, (req, res) => res.json({ success: true }));

app.post('/api/logout', (req, res) => res.json({ success: true }));

// 3. Fetch All Corners (PUBLIC)
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

// Upload Image Endpoint
app.post('/api/upload-image', requireAuth, (req, res) => {
    const { imageName, imageData } = req.body;
    if (!imageName || !imageData) return res.status(400).json({ error: 'Missing image data' });
    
    // Remove Base64 header
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const safeName = Date.now() + '_' + imageName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const dirPath = path.join(__dirname, 'assets', 'images');
    
    // Ensure dir exists
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    
    const filePath = path.join(dirPath, safeName);
    fs.writeFile(filePath, buffer, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to save image' });
        res.json({ success: true, fileName: safeName });
    });
});

app.put('/api/corners/reorder', requireAuth, (req, res) => {
    const { ids } = req.body;
    const stmt = db.prepare('UPDATE corners SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

app.post('/api/corners', requireAuth, (req, res) => {
    const { imageName, nameEn, nameAr } = req.body;
    db.run('INSERT INTO corners (imageName, nameEn, nameAr) VALUES (?, ?, ?)', [imageName, nameEn, nameAr], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, imageName, nameEn, nameAr });
    });
});

app.delete('/api/corners/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM items WHERE cornerId = ?', [req.params.id], () => {
        db.run('DELETE FROM corners WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.put('/api/items/reorder', requireAuth, (req, res) => {
    const { ids } = req.body;
    const stmt = db.prepare('UPDATE items SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

app.post('/api/items', requireAuth, (req, res) => {
    const { cornerId, nameEn, nameAr, price } = req.body;
    db.run('INSERT INTO items (cornerId, nameEn, nameAr, price) VALUES (?, ?, ?, ?)', [cornerId, nameEn, nameAr, price], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, cornerId, nameEn, nameAr, price });
    });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
    const { nameEn, nameAr, price } = req.body;
    db.run('UPDATE items SET nameEn = ?, nameAr = ?, price = ? WHERE id = ?', [nameEn, nameAr, price, req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
    db.run('DELETE FROM items WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===================== POS API ENDPOINTS =====================

// Pure Cashier Login via Username & Password
app.post('/api/pos/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Missing username or password' });

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    db.get('SELECT * FROM users WHERE username = ? AND password_hash = ?', [username, hash], (err, user) => {
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
    db.all('SELECT id, username, role FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', requireRoles(['admin']), (req, res) => {
    const { username, password } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const fakePin = crypto.randomUUID(); // satisfy PIN unique constraint safely
    const role = 'cashier'; // Force all new users to be cashiers
    
    db.run('INSERT INTO users (username, password_hash, pin, role) VALUES (?, ?, ?, ?)', [username, hash, fakePin, role], function(err) {
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

// Cash Movements (Cashier-based)
app.post('/api/cash-movement', requireRoles(['admin', 'cashier']), (req, res) => {
    const { type, amount, reason, cashier_id, cashier_name } = req.body;
    let finalCashierId = req.user?.id || 0;
    let finalCashierName = req.user?.username || 'Unknown';
    
    if (req.user?.role === 'admin' && cashier_id !== undefined) {
        finalCashierId = cashier_id;
        finalCashierName = cashier_name || 'Admin';
    }

    db.run('INSERT INTO cash_movements (type, amount, reason, cashier_id, cashier_name) VALUES (?, ?, ?, ?, ?)', 
        [type, amount, reason, finalCashierId, finalCashierName], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/movements/recent', requireRoles(['admin', 'cashier']), (req, res) => {
    const cashierId = req.user?.id || 0;
    const role      = req.user?.role || 'cashier';
    const query = role === 'admin'
        ? 'SELECT * FROM cash_movements ORDER BY id DESC LIMIT 50'
        : 'SELECT * FROM cash_movements WHERE cashier_id = ? ORDER BY id DESC LIMIT 50';
    const params = role === 'admin' ? [] : [cashierId];
    
    db.all(query, params, (err, movs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(movs || []);
    });
});

// Orders (POS)
app.post('/api/orders', requireRoles(['admin', 'cashier']), (req, res) => {
    const { status, total, payment_method, discount_amount, service_charge, notes, items, order_type } = req.body;
    const cashierName = req.user?.username || 'Unknown';
    const cashierId   = req.user?.id || 0;
    
    db.run('INSERT INTO orders (status, total, payment_method, discount_amount, notes, cashier_id, cashier_name, order_type, service_charge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [status || 'open', total, payment_method, discount_amount || 0, notes, cashierId, cashierName, order_type || 'Takeaway', service_charge || 0], function(err) {
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

// Update Order (for Multi-cart sync & updates)
app.put('/api/orders/:id', requireRoles(['admin', 'cashier']), (req, res) => {
    const { status, total, payment_method, discount_amount, service_charge, notes, items, order_type } = req.body;
    db.run('UPDATE orders SET status = ?, total = ?, payment_method = COALESCE(?, payment_method), discount_amount = ?, notes = ?, order_type = ?, service_charge = ? WHERE id = ?', 
        [status, total, payment_method, discount_amount, notes, order_type, service_charge || 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Re-write items
        db.run('DELETE FROM order_items WHERE order_id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (items && items.length > 0) {
                const stmt = db.prepare('INSERT INTO order_items (order_id, item_id, name, price, qty, notes) VALUES (?, ?, ?, ?, ?, ?)');
                items.forEach(item => stmt.run(req.params.id, item.item_id, item.name, item.price, item.qty, item.notes));
                stmt.finalize();
            }
            res.json({ success: true });
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

// Reports endpoint — period: daily | weekly | monthly | annual (Shiftless)
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
                    o.service_charge, o.order_type, GROUP_CONCAT(oi.qty || 'x ' || oi.name, ', ') as itemsSummary
                    FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id
                    ${baseWhere} GROUP BY o.id ORDER BY o.id DESC LIMIT 200`, [], (err, orders) => {
                if (err) return res.status(500).json({ error: err.message });

                db.all(`SELECT * FROM cash_movements WHERE created_at >= ${dateFilter} ORDER BY id DESC`, [], (err, movements) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0);
                    const totalOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0);

                    res.json({ period, summary, byCashier, orders, movements, totalIn, totalOut });
                });
            });
        });
    });
});


// Cashier daily stats (today's performance for logged-in cashier)
app.get('/api/cashier/stats', requireRoles(['admin', 'cashier']), (req, res) => {
    const cashierId = req.user?.id || 0;
    const startOfDay = "datetime('now', 'start of day')";

    // Find the last handover time for this cashier today
    db.get(`SELECT MAX(created_at) as last_handover FROM cash_movements 
            WHERE cashier_id = ? AND reason LIKE '%تسليم عهدة%' AND created_at >= ${startOfDay}`, [cashierId], (err, mov) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // If there is a handover today, only count stats AFTER that handover
        let startTime = startOfDay;
        if (mov && mov.last_handover) {
            startTime = `'${mov.last_handover}'`;
        }

        db.get(`SELECT
            COUNT(*) as totalOrders,
            COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0) as totalSales,
            COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Cash' THEN total ELSE 0 END),0) as cashSales,
            COALESCE(SUM(CASE WHEN status='paid' AND payment_method='Card' THEN total ELSE 0 END),0) as cardSales,
            COUNT(CASE WHEN status='paid' THEN 1 END) as paidOrders
            FROM orders WHERE cashier_id = ? AND created_at >= ${startTime}`,
            [cashierId], (err, stats) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, stats });
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
