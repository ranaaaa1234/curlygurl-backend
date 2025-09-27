import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { pool } from "./db";
import { v4 as uuidv4 } from "uuid";

const app = express();
const port = 4000;

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
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [
      req.params.id,
    ]) as [any[], any];
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

/* ----------------------- ORDER ----------------------- */

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  size: string;
  image: string;
  quantity?: number;
}

interface Order {
  id: string;
  items: Product[];
  total: number;
}

let orders: Order[] = [];

app.post("/orders", (req: Request, res: Response) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Invalid order items" });
  }

  const total = items.reduce(
    (sum: number, item: Product) => sum + item.price * (item.quantity || 1),
    0
  );

  const newOrder: Order = {
    id: uuidv4(),
    items,
    total,
  };

  orders.push(newOrder);
  res.status(201).json({ message: "Order placed", order: newOrder });
});

/* ----------------------- START SERVER ----------------------- */

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
