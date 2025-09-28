import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { pool } from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
const port = 4000;

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  size: string;
  image: string;
  quantity?: number;
}

app.use(cors());
app.use(express.json());

const JWT_SECRET = "supersecret"; // for demo only, store in env for real apps

// Access files with /uploads via http://localhost:4000/uploads/filename.jpg
app.use("/uploads", express.static("uploads"));

// Multer config for img upload
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/* ----------------------- PRODUKTER ----------------------- */

// GET all products
app.get("/products", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET product with ID
app.get("/products/:id", async (req, res) => {
  try {
    const [rows] = (await pool.query("SELECT * FROM products WHERE id = ?", [
      req.params.id,
    ])) as [any[], any];
    if (rows.length === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST create new product (with img)
app.post("/products", upload.single("image"), async (req, res) => {
  const { name, price, category, description, size, hairType } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const [result] = await pool.query(
      "INSERT INTO products (name, price, category, description, size, hairType, image) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, price, category, description, size, hairType, image]
    );

    res.status(201).json({
      id: (result as any).insertId,
      name,
      price,
      category,
      description,
      size,
      hairType,
      image,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT update product
app.put("/products/:id", upload.single("image"), async (req, res) => {
  const { name, price, category, description, size, hairType } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;

  try {
    const [result] = await pool.query(
      "UPDATE products SET name=?, price=?, category=?, description=?, size=?, hairType=?, image=? WHERE id=?",
      [name, price, category, description, size, hairType, image, req.params.id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      id: req.params.id,
      name,
      price,
      category,
      description,
      size,
      hairType,
      image,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE product
app.delete("/products/:id", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM products WHERE id = ?", [
      req.params.id,
    ]);
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------- AUTH MIDDLEWARE ----------------------- */
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user; // id, email, name from token
    next();
  });
}

/* ----------------------- CREATE ORDER ----------------------- */

app.post("/orders", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;
  const { items } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const total = items.reduce(
    (sum: number, item: Product) => sum + item.price * (item.quantity || 1),
    0
  );

  try {
    // Insert into orders table
    const [orderResult] = await pool.query(
      "INSERT INTO orders (user_id, total) VALUES (?, ?)",
      [userId, total]
    );
    const orderId = (orderResult as any).insertId;

    // Insert items into order_items table
    for (const item of items) {
      await pool.query(
        "INSERT INTO order_items (order_id, name, price, quantity) VALUES (?, ?, ?, ?)",
        [orderId, item.quantity, item.name, item.price || 1]
      );
    }

    res.status(201).json({
      message: "Order placed",
      order: {
        id: orderId,
        items,
        total,
      },
    });
  } catch (err: any) {
    console.error("Order error:", err.message);
    if (err.code) console.error("MySQL error code:", err.code);
    if (err.sqlMessage) console.error("MySQL message:", err.sqlMessage);
    if (err.sql) console.error("Failed SQL:", err.sql);

    res.status(500).json({ message: "Server error", error: err.sqlMessage });
  }
});

// logged-in user's orders
app.get("/user-orders", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;

  try {
    const [orders] = await pool.query(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );

    const ordersArray = Array.isArray(orders) ? orders : [];
    // Fetch items for each order
    const ordersWithItems = await Promise.all(
      ordersArray.map(async (order: any) => {
        const [items] = await pool.query(
          "SELECT name, price, quantity FROM order_items WHERE order_id = ?",
          [order.id]
        );
        return {
          ...order,
          items,
          date: order.created_at.toISOString().split("T")[0], // only date
        };
      })
    );

    res.json(ordersWithItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ----------------------- ADMIN ----------------------- */

// GET all orders with their items
app.get("/admin/orders", async (req, res) => {
  try {
    const [orders] = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );

    // Fetch items for each order
    const ordersWithItems = [];
    for (const order of orders as any[]) {
      const [items] = await pool.query(
        "SELECT * FROM order_items WHERE order_id = ?",
        [order.id]
      );
      ordersWithItems.push({ ...order, items });
    }

    res.json(ordersWithItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------- REGISTER -----------------
app.post("/register", async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------- LOGIN -----------------
app.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  try {
    const [rows] = (await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ])) as [any[], any];

    if (rows.length === 0)
      return res.status(400).json({ message: "Invalid email or password" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ----------------------- START SERVER ----------------------- */
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
