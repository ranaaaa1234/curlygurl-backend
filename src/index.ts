import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { pool } from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET as string;

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

/* ----------------------- PRODUCTS ----------------------- */

// GET all products
app.get("/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products");
    res.json(result.rows);
  } catch (err) {
    console.error("error fetching products:", err);
    const errorMessage = typeof err === "object" && err !== null && "message" in err ? (err as { message: string }).message : String(err);
    res.status(500).json({ error: "Server error", details: errorMessage });
  }
});

// GET product with ID
app.get("/products/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", 
      [req.params.id,]); 
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json(result.rows[0]);
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
    const result = await pool.query(
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
    const result = await pool.query(
      "UPDATE products SET name=$1, price=$2, category=$3, description=$4, size=$5, hairType=$6, image=$7 WHERE id=$8 RETURNING *",
      [name, price, category, description, size, hairType, image, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE product
app.delete("/products/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM products WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------- AUTH MIDDLEWARE ----------------------- */
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error("JWT error:", err);
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

/* ----------------------- CREATE ORDER ----------------------- */

app.post("/orders", async (req: any, res: any) => {
  const authHeader = req.headers["authorization"];
  let userId = null;

  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const user = jwt.verify(token, JWT_SECRET) as any;
      userId = user.id; // logged in user
    } catch (err) {
      console.warn("Invalid token, proceeding as guest");
    }
  }

  const { items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const total = items.reduce(
    (sum: number, item: any) => sum + item.price * (item.quantity || 1),
    0
  );

  try {
    const orderResult = await pool.query(
      "INSERT INTO orders (user_id, total) VALUES (?, ?)",
      [userId, total]
    );
    const orderId = (orderResult as any).insertId;

    for (const item of items) {
      await pool.query(
        "INSERT INTO order_items (order_id, name, price, quantity) VALUES (?, ?, ?, ?)",
        [orderId, item.name, item.price, item.quantity || 1]
      );
    }

    res.status(201).json({
      message: "Order placed",
      order: { id: orderId, items, total },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// logged in user's orders
app.get("/user-orders", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;

  try {
    const ordersResult = await pool.query(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    const orders = ordersResult.rows;

    // Fetch items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const itemsResult = await pool.query(
          "SELECT name, price, quantity FROM order_items WHERE order_id = ?",
          [order.id]
        );
        return {
          ...order,
          items: itemsResult.rows,
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
    const ordersResult = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    const orders = ordersResult.rows;

    // Fetch items for each order
    const ordersWithItems = [];
    for (const order of orders) {
      const itemsResult = await pool.query(
        "SELECT * FROM order_items WHERE order_id = ?",
        [order.id]
      );
      ordersWithItems.push({ ...order, items: itemsResult.rows });
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

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully, you can now log in" });
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

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

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
    const errorMessage = typeof err === "object" && err !== null && "message" in err ? (err as { message: string }).message : String(err);
    res.status(500).json({ message: "Server error", error: errorMessage });
  }
});

/* ----------------------- START SERVER ----------------------- */
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
