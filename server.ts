import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("unnichat.db");
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    number TEXT NOT NULL,
    platform TEXT DEFAULT 'Unnichat',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chip_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    action TEXT NOT NULL,
    leads_count INTEGER NOT NULL,
    template_type TEXT NOT NULL,
    cost REAL NOT NULL,
    observations TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chip_id) REFERENCES chips (id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin' or 'client'
    status TEXT DEFAULT 'active',
    client_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id)
  );
`);

// Seed initial admin if not exists
const adminExists = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run(
    "Administrator",
    "admin@unnichat.com",
    hashedPassword,
    "admin"
  );
}

const app = express();
app.use(express.json());

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- API Routes ---

// Auth
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, client_id: user.client_id }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, client_id: user.client_id } });
});

// Clients
app.get("/api/clients", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const clients = db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
  res.json(clients);
});

app.post("/api/clients", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, status } = req.body;
  const result = db.prepare("INSERT INTO clients (name, status) VALUES (?, ?)").run(name, status || 'active');
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/clients/:id", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, status } = req.body;
  db.prepare("UPDATE clients SET name = ?, status = ? WHERE id = ?").run(name, status, req.params.id);
  res.sendStatus(200);
});

// Chips
app.get("/api/chips", authenticateToken, (req: any, res) => {
  let chips;
  if (req.user.role === 'admin') {
    chips = db.prepare(`
      SELECT chips.*, clients.name as client_name 
      FROM chips 
      JOIN clients ON chips.client_id = clients.id 
      ORDER BY chips.created_at DESC
    `).all();
  } else {
    chips = db.prepare("SELECT * FROM chips WHERE client_id = ? ORDER BY created_at DESC").all(req.user.client_id);
  }
  res.json(chips);
});

app.post("/api/chips", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { client_id, name, number, status } = req.body;
  const result = db.prepare("INSERT INTO chips (client_id, name, number, status) VALUES (?, ?, ?, ?)")
    .run(client_id, name, number, status || 'active');
  res.json({ id: result.lastInsertRowid });
});

// Logs
app.get("/api/logs", authenticateToken, (req: any, res) => {
  let logs;
  if (req.user.role === 'admin') {
    logs = db.prepare(`
      SELECT logs.*, chips.name as chip_name, chips.number as chip_number, clients.name as client_name
      FROM logs
      JOIN chips ON logs.chip_id = chips.id
      JOIN clients ON chips.client_id = clients.id
      ORDER BY logs.date DESC
    `).all();
  } else {
    logs = db.prepare(`
      SELECT logs.*, chips.name as chip_name, chips.number as chip_number
      FROM logs
      JOIN chips ON logs.chip_id = chips.id
      WHERE chips.client_id = ?
      ORDER BY logs.date DESC
    `).all(req.user.client_id);
  }
  res.json(logs);
});

app.post("/api/logs", authenticateToken, (req: any, res) => {
  const { chip_id, date, action, leads_count, template_type, cost, observations } = req.body;
  
  // Verify chip belongs to user's client if not admin
  if (req.user.role !== 'admin') {
    const chip: any = db.prepare("SELECT client_id FROM chips WHERE id = ?").get(chip_id);
    if (!chip || chip.client_id !== req.user.client_id) return res.sendStatus(403);
  }

  const result = db.prepare(`
    INSERT INTO logs (chip_id, date, action, leads_count, template_type, cost, observations)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(chip_id, date, action, leads_count, template_type, cost, observations);
  
  res.json({ id: result.lastInsertRowid });
});

// Users
app.get("/api/users", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const users = db.prepare(`
    SELECT users.id, users.name, users.email, users.role, users.status, users.client_id, clients.name as client_name
    FROM users
    LEFT JOIN clients ON users.client_id = clients.id
    ORDER BY users.created_at DESC
  `).all();
  res.json(users);
});

app.post("/api/users", authenticateToken, (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, email, password, role, status, client_id } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password, role, status, client_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, email, hashedPassword, role, status || 'active', client_id);
    res.json({ id: result.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Dashboard Stats
app.get("/api/stats", authenticateToken, (req: any, res) => {
  let whereClause = "";
  let params: any[] = [];
  
  if (req.user.role !== 'admin') {
    whereClause = "WHERE chips.client_id = ?";
    params = [req.user.client_id];
  }

  const totalStats: any = db.prepare(`
    SELECT 
      SUM(logs.leads_count) as total_leads,
      SUM(logs.cost) as total_cost,
      COUNT(logs.id) as total_disparos
    FROM logs
    JOIN chips ON logs.chip_id = chips.id
    ${whereClause}
  `).get(...params);

  const costByChip = db.prepare(`
    SELECT chips.name, SUM(logs.cost) as cost
    FROM logs
    JOIN chips ON logs.chip_id = chips.id
    ${whereClause}
    GROUP BY chips.id
  `).all(...params);

  const costByTemplate = db.prepare(`
    SELECT logs.template_type, SUM(logs.cost) as cost
    FROM logs
    JOIN chips ON logs.chip_id = chips.id
    ${whereClause}
    GROUP BY logs.template_type
  `).all(...params);

  res.json({
    total_leads: totalStats.total_leads || 0,
    total_cost: totalStats.total_cost || 0,
    total_disparos: totalStats.total_disparos || 0,
    costByChip,
    costByTemplate
  });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
