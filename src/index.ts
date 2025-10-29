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
    const errorMessage =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message: string }).message
        : String(err);
    res.status(500).json({ error: "Server error", details: errorMessage });
  }
});

// GET product with ID
app.get("/products/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST create new product
app.post("/products", upload.single("image"), async (req, res) => {
  const { name, price, description, size } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      `INSERT INTO products 
      (name, price, description, size, image) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [name, price, description, size, image]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT update product
app.put("/products/:id", upload.single("image"), async (req, res) => {
  const { name, price, description, size } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;

  try {
    const result = await pool.query(
      `UPDATE products SET 
      name=$1, price=$2, description=$3, size=$4, image=$5
      WHERE id=$8 RETURNING *`,
      [name, price, description, size, image, req.params.id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Product not found" });

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

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Product not found" });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------- FAVOURITES ----------------------- */

// POST add to favorites
app.post("/favorites/:productId", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;
  const productId = req.params.productId;

  try {
    await pool.query(
      `INSERT INTO favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [userId, productId]
    );

    res.json({ message: "Added to favorites" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE remove from favorites
app.delete("/favorites/:productId", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;
  const productId = req.params.productId;

  try {
    await pool.query(
      `DELETE FROM favorites WHERE user_id = $1 AND product_id = $2`,
      [userId, productId]
    );

    res.json({ message: "Removed from favorites" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET user's favorite products
app.get("/favorites", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT p.* 
       FROM products p
       JOIN favorites f ON p.id = f.product_id
       WHERE f.user_id = $1`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


/* ----------------------- ORDERS ----------------------- */

// POST create order
app.post("/orders", async (req: any, res: any) => {
  const authHeader = req.headers["authorization"];
  let userId = null;

  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const user = jwt.verify(token, JWT_SECRET) as any;
      userId = user.id;
    } catch (err) {
      console.warn("Invalid token, proceeding as guest");
    }
  }

  const { items } = req.body;
  if (!items || items.length === 0)
    return res.status(400).json({ message: "Cart is empty" });

  const total = items.reduce(
    (sum: number, item: any) => sum + item.price * (item.quantity || 1),
    0
  );

  try {
    const orderResult = await pool.query(
      "INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id",
      [userId, total]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await pool.query(
        "INSERT INTO order_items (order_id, name, price, quantity) VALUES ($1, $2, $3, $4)",
        [orderId, item.name, item.price, item.quantity || 1]
      );
    }

    res.status(201).json({ message: "Order placed", order: { id: orderId, items, total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET logged-in user's orders
app.get("/user-orders", authenticateToken, async (req: any, res: any) => {
  const userId = req.user.id;

  try {
    const ordersResult = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    const orders = ordersResult.rows;

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const itemsResult = await pool.query(
          "SELECT name, price, quantity FROM order_items WHERE order_id = $1",
          [order.id]
        );
        return { ...order, items: itemsResult.rows, date: order.created_at.toISOString().split("T")[0] };
      })
    );

    res.json(ordersWithItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
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

/* ----------------------- AUTH ----------------------- */

// REGISTER
app.post("/register", async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully, you can now log in" });
  } catch (err: any) {
    if (err.code === "23505") { // unique violation
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message } );
  }
});

// LOGIN
app.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const rows = result.rows;

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

    res.json({ message: "Login successful", token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    const errorMessage =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message: string }).message
        : String(err);
    res.status(500).json({ message: "Server error", error: errorMessage });
  }
});

/* ----------------------- START SERVER ----------------------- */
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.get("/", (req, res) => {
  res.send("Backend is alive :)");
});
