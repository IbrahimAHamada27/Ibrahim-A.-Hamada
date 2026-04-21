require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);
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
const JWT_SECRET = process.env.JWT_SECRET || 'coffee-duck-pos-secret-v2';

function generateToken(username) {
    return crypto.createHmac('sha256', SECRET_KEY).update(username + ADMIN_PASSWORD).digest('hex');
}

function requireAuth(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (!token || token !== generateToken(ADMIN_USERNAME)) {
        return res.status(401).json({ success: false, message: 'Unauthorized — please log in again' });
    }
    next();
}

function requireRoles(roles) {
    return (req, res, next) => {
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

// ===================== MONGODB DATABASE =====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/coffee-duck';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Mongoose Models
const CornerSchema = new mongoose.Schema({
    imageName: String, nameEn: String, nameAr: String, sortOrder: { type: Number, default: 0 }
});
CornerSchema.plugin(AutoIncrement, {inc_field: 'id', id: 'corner_id_counter'});
const Corner = mongoose.model('Corner', CornerSchema);

const ItemSchema = new mongoose.Schema({
    cornerId: Number, nameEn: String, nameAr: String, price: String, sortOrder: { type: Number, default: 0 }
});
ItemSchema.plugin(AutoIncrement, {inc_field: 'id', id: 'item_id_counter'});
const Item = mongoose.model('Item', ItemSchema);

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true }, password_hash: String, pin: { type: String, unique: true }, role: String
});
UserSchema.plugin(AutoIncrement, {inc_field: 'id', id: 'user_id_counter'});
const User = mongoose.model('User', UserSchema);

const OrderItemSchema = new mongoose.Schema({
    item_id: Number, name: String, price: Number, qty: Number, notes: String
}, { _id: false });

const OrderSchema = new mongoose.Schema({
    status: { type: String, default: 'open' }, total: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }, payment_method: String, discount_amount: { type: Number, default: 0 },
    service_charge: { type: Number, default: 0 }, notes: String, cashier_id: { type: Number, default: 0 },
    cashier_name: { type: String, default: '' }, order_type: { type: String, default: 'Takeaway' },
    items: [OrderItemSchema]
});
OrderSchema.plugin(AutoIncrement, {inc_field: 'id', id: 'order_id_counter'});
const Order = mongoose.model('Order', OrderSchema);

const CashMovementSchema = new mongoose.Schema({
    type: String, amount: Number, reason: String, created_at: { type: Date, default: Date.now },
    cashier_id: { type: Number, default: 0 }, cashier_name: { type: String, default: 'Unknown' }
});
CashMovementSchema.plugin(AutoIncrement, {inc_field: 'id', id: 'cashmovement_id_counter'});
const CashMovement = mongoose.model('CashMovement', CashMovementSchema);

// Initial Seed Users
async function seedDefaultUsers() {
    const adminCount = await User.countDocuments();
    if (adminCount === 0) {
        console.log('Seeding default POS users...');
        const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
        const cashierHash = crypto.createHash('sha256').update('cashier123').digest('hex');
        await User.create([{ username: 'admin', password_hash: adminHash, pin: crypto.randomUUID(), role: 'admin' }]);
        await User.create([{ username: 'cashier', password_hash: cashierHash, pin: crypto.randomUUID(), role: 'cashier' }]);
    }
}
seedDefaultUsers();

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many requests' }});

// ===================== API ENDPOINTS =====================

app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        res.json({ success: true, token: generateToken(username) });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/verify', requireAuth, (req, res) => res.json({ success: true }));
app.post('/api/logout', (req, res) => res.json({ success: true }));

app.get('/api/corners', async (req, res) => {
    try {
        const corners = await Corner.find().sort({ sortOrder: 1, id: 1 }).lean();
        const items = await Item.find().sort({ sortOrder: 1, id: 1 }).lean();
        const result = corners.map(corner => ({
            ...corner,
            items: items.filter(i => i.cornerId === corner.id)
        }));
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload-image', requireAuth, (req, res) => {
    const { imageName, imageData } = req.body;
    if (!imageName || !imageData) return res.status(400).json({ error: 'Missing Data' });
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const safeName = Date.now() + '_' + imageName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const dirPath = path.join(__dirname, 'assets', 'images');
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFile(path.join(dirPath, safeName), buffer, err => {
        if (err) return res.status(500).json({ error: 'Failed' });
        res.json({ success: true, fileName: safeName });
    });
});

app.put('/api/corners/reorder', requireAuth, async (req, res) => {
    const { ids } = req.body;
    for (const [index, id] of ids.entries()) { await Corner.updateOne({ id }, { sortOrder: index }); }
    res.json({ success: true });
});

app.post('/api/corners', requireAuth, async (req, res) => {
    try {
        const corner = await Corner.create(req.body);
        res.json({ id: corner.id, imageName: corner.imageName, nameEn: corner.nameEn, nameAr: corner.nameAr });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/corners/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    await Item.deleteMany({ cornerId: id });
    await Corner.deleteOne({ id });
    res.json({ success: true });
});

app.put('/api/items/reorder', requireAuth, async (req, res) => {
    const { ids } = req.body;
    for (const [index, id] of ids.entries()) { await Item.updateOne({ id }, { sortOrder: index }); }
    res.json({ success: true });
});

app.post('/api/items', requireAuth, async (req, res) => {
    try {
        const item = await Item.create(req.body);
        res.json({ id: item.id, ...req.body });
    } catch(err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/items/:id', requireAuth, async (req, res) => {
    await Item.updateOne({ id: parseInt(req.params.id) }, req.body);
    res.json({ success: true });
});

app.delete('/api/items/:id', requireAuth, async (req, res) => {
    await Item.deleteOne({ id: parseInt(req.params.id) });
    res.json({ success: true });
});

// ===================== POS API =====================

app.post('/api/pos/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = await User.findOne({ username, password_hash: hash });
    if (!user) return res.status(401).json({ success: false });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/pos/verify', requireRoles([]), (req, res) => res.json({ success: true, user: req.user }));

app.get('/api/users', requireRoles(['admin']), async (req, res) => res.json(await User.find({}, 'id username role')));

app.post('/api/users', requireRoles(['admin']), async (req, res) => {
    const { username, password } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = await User.create({ username, password_hash: hash, pin: crypto.randomUUID(), role: 'cashier' });
    res.json({ success: true, id: user.id });
});

app.delete('/api/users/:id', requireRoles(['admin']), async (req, res) => {
    await User.deleteOne({ id: parseInt(req.params.id) });
    res.json({ success: true });
});

app.post('/api/cash-movement', requireRoles(['admin', 'cashier']), async (req, res) => {
    const data = { ...req.body };
    data.cashier_id = req.user?.role === 'admin' ? (req.body.cashier_id || req.user.id) : req.user?.id || 0;
    data.cashier_name = req.user?.role === 'admin' ? (req.body.cashier_name || 'Admin') : req.user?.username || 'Unknown';
    const mov = await CashMovement.create(data);
    res.json({ success: true, id: mov.id });
});

app.get('/api/movements/recent', requireRoles(['admin', 'cashier']), async (req, res) => {
    const query = req.user?.role === 'admin' ? {} : { cashier_id: req.user?.id || 0 };
    res.json(await CashMovement.find(query).sort({ _id: -1 }).limit(50));
});

app.post('/api/orders', requireRoles(['admin', 'cashier']), async (req, res) => {
    const data = { ...req.body, cashier_id: req.user?.id || 0, cashier_name: req.user?.username || 'Unknown' };
    try {
        const order = await Order.create(data);
        res.json({ success: true, order_id: order.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/orders/:id', requireRoles(['admin', 'cashier']), async (req, res) => {
    await Order.updateOne({ id: parseInt(req.params.id) }, req.body);
    res.json({ success: true });
});

app.get('/api/orders/active', requireRoles(['admin', 'cashier']), async (req, res) => {
    res.json(await Order.find({ status: { $in: ['open', 'held'] } }).sort({ _id: -1 }));
});

app.put('/api/orders/:id/status', requireRoles(['admin', 'cashier']), async (req, res) => {
    await Order.updateOne({ id: parseInt(req.params.id) }, req.body);
    res.json({ success: true });
});

app.get('/api/reports', requireRoles(['admin']), async (req, res) => {
    const period = req.query.period || 'daily';
    const customHours = parseInt(req.query.hours);
    const cashierId = parseInt(req.query.cashier_id);
    let dateFilter = new Date();
    
    if (customHours) dateFilter.setHours(dateFilter.getHours() - customHours);
    else if (period === 'weekly') dateFilter.setDate(dateFilter.getDate() - 7);
    else if (period === 'monthly') dateFilter.setMonth(dateFilter.getMonth() - 1);
    else if (period === 'annual') dateFilter.setFullYear(dateFilter.getFullYear() - 1);
    else dateFilter.setHours(0,0,0,0); // start of day

    const query = { status: 'paid', created_at: { $gte: dateFilter } };
    if (cashierId) query.cashier_id = cashierId;

    const orders = await Order.find(query).lean();
    
    const summary = {
        totalOrders: orders.length,
        totalSales: orders.reduce((s,o)=>s+o.total,0),
        cashSales: orders.filter(o=>o.payment_method==='Cash').reduce((s,o)=>s+o.total,0),
        cardSales: orders.filter(o=>o.payment_method==='Card').reduce((s,o)=>s+o.total,0)
    };

    const byCashierMap = {};
    orders.forEach(o => {
        if (!byCashierMap[o.cashier_name]) {
            byCashierMap[o.cashier_name] = { cashier_name: o.cashier_name, cashier_id: o.cashier_id, orderCount: 0, totalSales: 0, cashSales: 0, cardSales: 0 };
        }
        const b = byCashierMap[o.cashier_name];
        b.orderCount++; b.totalSales += o.total;
        if (o.payment_method === 'Cash') b.cashSales += o.total;
        if (o.payment_method === 'Card') b.cardSales += o.total;
    });
    const byCashier = Object.values(byCashierMap).sort((a,b)=>b.totalSales - a.totalSales);

    // Recent 200 orders formatted
    const recentOrders = orders.slice(-200).reverse().map(o => ({
        id: o.id, created_at: o.created_at, total: o.total, payment_method: o.payment_method,
        cashier_name: o.cashier_name, discount_amount: o.discount_amount, service_charge: o.service_charge,
        order_type: o.order_type, itemsSummary: o.items.map(i => `${i.qty}x ${i.name}`).join(', ')
    }));

    const movQuery = { created_at: { $gte: dateFilter } };
    if (cashierId) movQuery.cashier_id = cashierId;
    const movements = await CashMovement.find(movQuery).sort({ _id: -1 }).lean();
    
    const totalIn = movements.filter(m=>m.type==='in').reduce((s,m)=>s+m.amount,0);
    const totalOut = movements.filter(m=>m.type==='out').reduce((s,m)=>s+m.amount,0);

    res.json({ period, summary, byCashier, orders: recentOrders, movements, totalIn, totalOut });
});

app.get('/api/cashier/stats', requireRoles(['admin', 'cashier']), async (req, res) => {
    const cashierId = req.user?.id || 0;
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    
    const lastHandover = await CashMovement.findOne({ cashier_id: cashierId, reason: /تسليم عهدة/, created_at: { $gte: startOfDay } }).sort({ _id: -1 });
    const startTime = lastHandover ? lastHandover.created_at : startOfDay;

    const orders = await Order.find({ cashier_id: cashierId, created_at: { $gte: startTime } });
    const movs = await CashMovement.find({ cashier_id: cashierId, created_at: { $gte: startTime } });

    const stats = {
        totalOrders: orders.length,
        totalSales: orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.total,0),
        cashSales: orders.filter(o=>o.status==='paid'&&o.payment_method==='Cash').reduce((s,o)=>s+o.total,0),
        cardSales: orders.filter(o=>o.status==='paid'&&o.payment_method==='Card').reduce((s,o)=>s+o.total,0),
        paidOrders: orders.filter(o=>o.status==='paid').length,
        cashIn: movs.filter(m=>m.type==='in').reduce((s,m)=>s+m.amount,0),
        cashOut: movs.filter(m=>m.type==='out' && !m.reason.includes('تسليم عهدة')).reduce((s,m)=>s+m.amount,0)
    };
    res.json({ success: true, stats });
});

// Frontend Routes
const serveHtml = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/admin.html', serveHtml('admin.html'));
app.get('/cashier.html', serveHtml('cashier.html'));
app.get('/cashier', serveHtml('cashier.html'));
app.get('/admin-dashboard.html', serveHtml('admin-dashboard.html'));
app.get('/admin-dashboard', serveHtml('admin-dashboard.html'));
app.get('/', serveHtml('index.html'));
app.get('/index.html', serveHtml('index.html'));
app.get('/login.html', serveHtml('login.html'));

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
module.exports = app;
