// Usage: mongosh mongodb://localhost:27017/testdb --file generate-data.js
// Or:   mongosh --eval "load('generate-data.js')"

const TOTAL_DOCS = 1_000_000;
const BATCH_SIZE = 10_000;
const COLLECTION = 'bigCollection';

const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore'];
const cities = ['New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto', 'Mumbai', 'São Paulo', 'Cairo'];
const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Support', 'Legal', 'Product', 'Design', 'Operations'];
const statuses = ['active', 'inactive', 'pending', 'suspended', 'archived'];
const tags = ['premium', 'beta', 'enterprise', 'trial', 'internal', 'vip', 'legacy', 'new'];
const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'magenta'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.floor(Math.random() * n) + 1);
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return +(Math.random() * (max - min) + min).toFixed(2); }
function randDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
}
function randBool() { return Math.random() > 0.5; }
function randHex(len) { return [...Array(len)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''); }

function generateDoc(i) {
  const doc = {
    seq: i,
    name: `${pick(firstNames)} ${pick(lastNames)}`,
    email: `user${i}@${pick(['gmail.com', 'outlook.com', 'company.org', 'example.net'])}`,
    age: randInt(18, 85),
    salary: randFloat(30000, 250000),
    department: pick(departments),
    status: pick(statuses),
    isVerified: randBool(),
    joinedAt: randDate(2015, 2026),
    lastLogin: randDate(2024, 2026),
    score: randFloat(0, 100),
    tags: pickN(tags, 4),
    address: {
      city: pick(cities),
      zip: String(randInt(10000, 99999)),
      street: `${randInt(1, 9999)} ${pick(['Main', 'Oak', 'Pine', 'Elm', 'Cedar', 'Maple'])} ${pick(['St', 'Ave', 'Blvd', 'Dr', 'Ln'])}`,
      geo: { lat: randFloat(-90, 90), lng: randFloat(-180, 180) },
    },
    preferences: {
      theme: pick(['dark', 'light', 'auto']),
      language: pick(['en', 'es', 'fr', 'de', 'ja', 'pt', 'zh']),
      notifications: randBool(),
      color: pick(colors),
    },
    metrics: {
      logins: randInt(0, 5000),
      purchases: randInt(0, 500),
      avgSessionMinutes: randFloat(0.5, 120),
      referrals: randInt(0, 50),
    },
    notes: randBool() ? `Note ${randHex(8)}: ${pick(['Needs follow-up', 'VIP customer', 'Escalated', 'Resolved', 'Pending review'])}` : null,
    metadata: BinData(0, randHex(32)),
  };

  // Randomly add optional fields for type variety
  if (i % 7 === 0) doc.rating = NumberDecimal(randFloat(1, 5).toString());
  if (i % 11 === 0) doc.legacyId = NumberInt(randInt(1, 999999));
  if (i % 13 === 0) doc.bigCounter = NumberLong(String(randInt(1, 9999999999)));
  if (i % 17 === 0) doc.sessionId = UUID();
  if (i % 19 === 0) doc.pattern = /user_\d+/i;

  return doc;
}

print(`Generating ${TOTAL_DOCS.toLocaleString()} documents into '${COLLECTION}'...`);
db[COLLECTION].drop();

const startTime = Date.now();
for (let batch = 0; batch < TOTAL_DOCS; batch += BATCH_SIZE) {
  const docs = [];
  const end = Math.min(batch + BATCH_SIZE, TOTAL_DOCS);
  for (let i = batch; i < end; i++) {
    docs.push(generateDoc(i));
  }
  db[COLLECTION].insertMany(docs, { ordered: false });
  const pct = ((end / TOTAL_DOCS) * 100).toFixed(1);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  print(`  ${pct}% (${end.toLocaleString()} docs, ${elapsed}s)`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
print(`\nDone! Inserted ${TOTAL_DOCS.toLocaleString()} docs in ${elapsed}s`);
print(`Collection stats:`);
printjson(db[COLLECTION].stats());
