const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS corners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imageName TEXT,
        nameEn TEXT,
        nameAr TEXT
    );
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cornerId INTEGER,
        nameEn TEXT,
        nameAr TEXT,
        price TEXT,
        FOREIGN KEY(cornerId) REFERENCES corners(id) ON DELETE CASCADE
    );
`);

// Clear existing data
db.prepare('DELETE FROM items').run();
db.prepare('DELETE FROM corners').run();

const cornersData = [
    {
        imageName: 'espresso.jpeg', nameEn: 'Duck Espresso Corner', nameAr: 'ركن الإسبريسو',
        items: [
            ['Spanish Latte', 'سبانش لاتيه', '105'],
            ['Latte', 'لاتيه', '80'],
            ['Cappuccino', 'كابتشينو', '90'],
            ['Flat White', 'فلات وايت', '70'],
            ['Mocha', 'موكا', '85'],
            ['Caramel Mocha', 'كراميل موكا', '95'],
            ['Caramel Macchiato', 'كراميل ماكياتو', '95'],
            ['Hot Chocolate', 'هوت شوكليت', '90'],
            ['Dulce De Leche Latte', 'دولسي دي ليتشي لاتيه', '95'],
            ['Espresso (S/D)', 'إسبريسو (سنجل/دبل)', '45 / 55'],
            ['Espresso Macchiato (S/D)', 'إسبريسو ماكياتو (سنجل/دبل)', '50 / 60'],
            ['Cortado', 'كورتادو', '65'],
            ['Americano (M/L)', 'أمريكانو (وسط/كبير)', '60 / 70'],
            ['Hot Chocolate Marshmallow', 'هوت شوكليت مارشميلو', '120'],
        ]
    },
    {
        imageName: 'hot1.jpeg', nameEn: 'Duck Hot Corner', nameAr: 'مشروبات ساخنة',
        items: [
            ['English Tea (M/L)', 'شاي إنجليزي (وسط/كبير)', '40 / 50'],
            ['Green Tea (M/L)', 'شاي أخضر (وسط/كبير)', '40 / 50'],
            ['Earl Grey Tea (M/L)', 'شاي إيرل جراي (وسط/كبير)', '40 / 50'],
            ['Anise (M/L)', 'يانسون (وسط/كبير)', '35 / 45'],
            ['Roselle (M/L)', 'كركديه (وسط/كبير)', '35 / 45'],
            ['Mint (M/L)', 'نعناع (وسط/كبير)', '35 / 45'],
            ['Lemon Ginger (M/L)', 'ليمون بالزنجبيل (وسط/كبير)', '35 / 45'],
            ['Herbs (M/L)', 'أعشاب (وسط/كبير)', '50 / 60'],
            ['Flavored Tea (M/L)', 'شاي بنكهات (وسط/كبير)', '50 / 60'],
        ]
    },
    {
        imageName: 'hot.jpeg', nameEn: 'Duck Hot Corner 2', nameAr: 'مشروبات ساخنة 2',
        items: [
            ['Tea With Milk (M/L)', 'شاي بحليب (وسط/كبير)', '50 / 60'],
            ['Nescafe With Milk (M/L)', 'نسكافيه بالحليب (وسط/كبير)', '50 / 65'],
            ['Nescafe Black', 'نسكافيه بلاك', '35 / 50'],
            ['Hot Cider', 'هوت سيدر', '80'],
            ['Cinnamon With Milk', 'قرفة بالحليب', '50 / 60'],
            ['Sahlab Nuts', 'سحلب بالمكسرات', '75'],
            ['Karak Tea', 'شاي كرك', '70'],
        ]
    },
    {
        imageName: 'coffee.jpeg', nameEn: 'Duck Coffee Corner', nameAr: 'ركن القهوة',
        items: [
            ['Turkish Coffee (S/D)', 'قهوة تركي (سنجل/دبل)', '40 / 60'],
            ['French Coffee (S/D)', 'قهوة فرنساوي (سنجل/دبل)', '45 / 65'],
            ['Hazelnut Coffee (S/D)', 'قهوة بالبندق (سنجل/دبل)', '50 / 70'],
            ['Nutella Coffee (S/D)', 'قهوة نوتيلا (سنجل/دبل)', '55 / 75'],
        ]
    },
    {
        imageName: 'iced.jpeg', nameEn: 'Duck Iced Corner', nameAr: 'ركن المثلجات',
        items: [
            ['Ice Latte', 'أيس لاتيه', '90'],
            ['Ice Chocolate', 'أيس شوكليت', '90'],
            ['Ice Mocha', 'أيس موكا', '95'],
            ['Ice Dulce De Leche', 'أيس دولسي دي ليتشي', '95'],
            ['Ice Spanish Latte', 'أيس سبانش لاتيه', '105'],
            ['Ice Caramel Macchiato', 'أيس كراميل ماكياتو', '95'],
            ['Ice Americano', 'أيس أمريكانو', '70'],
        ]
    },
    {
        imageName: 'frappe.jpeg', nameEn: 'Duck Frappe Corner', nameAr: 'ركن الفرابيه',
        items: [
            ['Caramel Frappe', 'فرابيه كراميل', '95'],
            ['Vanilla Frappe', 'فرابيه فانيليا', '95'],
            ['Hazelnut Frappe', 'فرابيه بندق', '95'],
            ['Mocha Frappe', 'فرابيه موكا', '95'],
            ['Dulce De Leche Frappe', 'فرابيه دولسي دي ليتشي', '95'],
            ['Strawberry Frappe', 'فرابيه فراولة', '95'],
            ['Peach Frappe', 'فرابيه خوخ', '95'],
            ['Oreo Frappe', 'فرابيه أوريو', '95'],
            ['Spanish Frappe', 'فرابيه سبانش', '105'],
            ['Peanut Butter Frappe', 'فرابيه زبدة الفول السوداني', '105'],
        ]
    },
    {
        imageName: 'yogurt.jpeg', nameEn: 'Duck Yogurt Corner', nameAr: 'ركن الزبادي',
        items: [
            ['Strawberry Yogurt', 'زبادي فراولة', '90'],
            ['Peach Yogurt', 'زبادي خوخ', '90'],
            ['Kiwi Yogurt', 'زبادي كيوي', '90'],
            ['Mango Yogurt', 'زبادي مانجو', '90'],
            ['Blueberry Yogurt', 'زبادي توت أزرق', '90'],
            ['Honey Yogurt', 'زبادي عسل', '90'],
            ['Passion Fruit Yogurt', 'زبادي باشن فروت', '90'],
        ]
    },
    {
        imageName: 'smoothies.jpeg', nameEn: 'Duck Smoothies Corner', nameAr: 'ركن السموذي',
        items: [
            ['Blueberry Smoothie', 'سموذي توت أزرق', '80'],
            ['Mango Smoothie', 'سموذي مانجو', '80'],
            ['Strawberry Smoothie', 'سموذي فراولة', '80'],
            ['Peach Smoothie', 'سموذي خوخ', '80'],
            ['Pineapple Smoothie', 'سموذي أناناس', '80'],
            ['Kiwi Smoothie', 'سموذي كيوي', '80'],
            ['Passion Fruit Smoothie', 'سموذي باشن فروت', '80'],
            ['Pinaculada Smoothie', 'سموذي بينا كولادا', '80'],
        ]
    },
    {
        imageName: 'soda.jpeg', nameEn: 'Duck Soda Corner', nameAr: 'ركن الصودا',
        items: [
            ['Redbull', 'ريدبول', '85'],
            ['Cherry Cola', 'شيري كولا', '80'],
            ['Jelly Cola', 'جيلي كولا', '80'],
            ['Mojito', 'موهيتو', '80'],
            ['Sunshine', 'صن شاين', '80'],
            ['Soft Drinks', 'مشروبات غازية', '45'],
            ['Mineral Water', 'مياه معدنية', '10'],
        ]
    },
    {
        imageName: 'juice.jpeg', nameEn: 'Duck Juice Corner', nameAr: 'عصائر فريش',
        items: [
            ['Mango', 'مانجو', '80'],
            ['Strawberry', 'فراولة', '70'],
            ['Orange', 'برتقال', '70'],
            ['Guava', 'جوافة', '70'],
            ['Tangerine', 'يوسفي', '70'],
            ['Banana With Milk', 'موز باللبن', '70'],
            ['Guava With Milk', 'جوافة باللبن', '70'],
            ['Lemon Mint', 'ليمون نعناع', '70'],
        ]
    },
    {
        imageName: 'boba.jpeg', nameEn: 'Duck Boba Corner', nameAr: 'ركن البوبا',
        items: [
            ['Blueberry Boba', 'بوبا توت أزرق', '90'],
            ['Strawberry Boba', 'بوبا فراولة', '90'],
            ['Passion Fruit Boba', 'بوبا باشن فروت', '90'],
        ]
    },
    {
        imageName: '', nameEn: 'Duck Extras', nameAr: 'إضافات',
        items: [
            ['Extra Espresso', 'إضافه إسبريسو', '30'],
            ['Extra Flavor', 'إضافة نكهة', '20'],
            ['Extra Milk', 'إضافة حليب', '20'],
            ['Extra Sauce', 'إضافة صوص', '20'],
            ['Extra Boba', 'إضافة بوبا', '35'],
        ]
    },
    {
        imageName: 'dessert.jpeg', nameEn: 'Desserts', nameAr: 'حلويات',
        items: [
            ['Chocolate Bar Date', 'بار تمر بالشوكولاتة', '30'],
            ['Cookies', 'كوكيز', '45'],
            ['Brownies', 'براونيز', '55'],
            ['Chocolate Cheese Cake', 'تشيز كيك شوكولاتة', '80'],
            ['Strawberry Cheese Cake', 'تشيز كيك فراولة', '80'],
            ['Lotus Cheese Cake', 'تشيز كيك لوتس', '85'],
            ['Ding Dong Cake', 'دينج دونج كيك', '65'],
            ['Chocolate Muffin', 'مافن شوكولاتة', '45'],
            ['Chocolate Cake', 'كيك شوكولاتة', '75'],
            ['Chocolate Date Bar', 'بار تمر بالشوكولاتة', '35'],
            ['English Cake', 'كيك إنجليزي', '35'],
            ['Marble Cake', 'كيك ماربل', '35'],
            ['Lava Cake', 'لافا كيك', '120'],
        ]
    },
    {
        imageName: 'playstation.jpeg', nameEn: 'Playstation Corner', nameAr: 'ركن البلايستيشن',
        items: [
            ['PS5 - Single', 'بلايستيشن 5 - فردي', '80'],
            ['PS5 - Multiplayer', 'بلايستيشن 5 - جماعي', '110'],
            ['PS4 - Single', 'بلايستيشن 4 - فردي', '60'],
            ['PS4 - Multiplayer', 'بلايستيشن 4 - جماعي', '90'],
        ]
    },
];

const insertCorner = db.prepare('INSERT INTO corners (imageName, nameEn, nameAr) VALUES (?, ?, ?)');
const insertItem = db.prepare('INSERT INTO items (cornerId, nameEn, nameAr, price) VALUES (?, ?, ?, ?)');

for (const corner of cornersData) {
    const info = insertCorner.run(corner.imageName, corner.nameEn, corner.nameAr);
    for (const item of corner.items) {
        insertItem.run(info.lastInsertRowid, item[0], item[1], item[2]);
    }
}

db.close();
console.log(`Done! Seeded ${cornersData.length} corners with all items.`);
