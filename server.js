const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
db.run('PRAGMA foreign_keys = ON');

// Create tables + migrate sortOrder if missing
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
    // Migrate: add sortOrder to existing tables if missing
    db.run(`ALTER TABLE corners ADD COLUMN sortOrder INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE items ADD COLUMN sortOrder INTEGER DEFAULT 0`, () => {});

    // Auto-seed if empty
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

    const insertCorner = db.prepare('INSERT INTO corners (imageName, nameEn, nameAr) VALUES (?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO items (cornerId, nameEn, nameAr, price) VALUES (?, ?, ?, ?)');

    for (const corner of cornersData) {
        insertCorner.run(corner.imageName, corner.nameEn, corner.nameAr, function() {
            const cornerId = this.lastID;
            for (const item of corner.items) {
                insertItem.run(cornerId, item[0], item[1], item[2]);
            }
        });
    }
    console.log('Database seeded successfully!');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ================= API ENDPOINTS =================

// 1. Admin Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'IbrahimA.Hamada' && password === 'admin123') {
        res.json({ success: true, token: 'fake-jwt-token-for-demo' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// 2. Fetch All Corners with Items (sorted by sortOrder)
app.get('/api/corners', (req, res) => {
    db.all('SELECT * FROM corners ORDER BY sortOrder ASC, id ASC', [], (err, corners) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all('SELECT * FROM items ORDER BY sortOrder ASC, id ASC', [], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            const result = corners.map(corner => ({
                ...corner,
                items: items.filter(i => i.cornerId === corner.id)
            }));
            res.json(result);
        });
    });
});

// 2b. Reorder Corners
app.put('/api/corners/reorder', (req, res) => {
    const { ids } = req.body; // array of corner IDs in new order
    const stmt = db.prepare('UPDATE corners SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

// 2c. Reorder Items within a Corner
app.put('/api/items/reorder', (req, res) => {
    const { ids } = req.body; // array of item IDs in new order
    const stmt = db.prepare('UPDATE items SET sortOrder = ? WHERE id = ?');
    ids.forEach((id, index) => stmt.run(index, id));
    stmt.finalize();
    res.json({ success: true });
});

// 3. Add a New Corner
app.post('/api/corners', (req, res) => {
    const { imageName, nameEn, nameAr } = req.body;
    db.run('INSERT INTO corners (imageName, nameEn, nameAr) VALUES (?, ?, ?)', [imageName, nameEn, nameAr], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, imageName, nameEn, nameAr });
    });
});

// 4. Delete a Corner
app.delete('/api/corners/:id', (req, res) => {
    db.run('DELETE FROM items WHERE cornerId = ?', [req.params.id], () => {
        db.run('DELETE FROM corners WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// 5. Add a New Item
app.post('/api/items', (req, res) => {
    const { cornerId, nameEn, nameAr, price } = req.body;
    db.run('INSERT INTO items (cornerId, nameEn, nameAr, price) VALUES (?, ?, ?, ?)', [cornerId, nameEn, nameAr, price], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, cornerId, nameEn, nameAr, price });
    });
});

// 6. Update an Item
app.put('/api/items/:id', (req, res) => {
    const { nameEn, nameAr, price } = req.body;
    db.run('UPDATE items SET nameEn = ?, nameAr = ?, price = ? WHERE id = ?', [nameEn, nameAr, price, req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// 7. Delete an Item
app.delete('/api/items/:id', (req, res) => {
    db.run('DELETE FROM items WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// Serve HTML pages explicitly
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));
app.get('/admin-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Start server
app.listen(port, () => {
    console.log(`Coffee Duck Server running at http://localhost:${port}`);
});
