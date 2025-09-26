import multer from "multer";
import path from "path";
import { pool } from "./db";

import express, { Request, Response } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));


// Multer storage setup
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  size: string;
  hairType: string;
  image: string;
  quantity?: number;
}

let products: Product[] = [
  {
    id: "moisturizing-shampoo-01",
    name: "Shampoo",
    price: 179,
    category: "Schampoo",
    description: "Återfuktar och rengör skonsamt lockigt hår.",
    size: "300 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGSHAMPOO.JPG",
  },
  {
    id: "Conditioner-02",
    name: "Conditioner",
    price: 179,
    category: "Conditioner",
    description: "Ger näring och hjälper till att reda ut trassligt hår.",
    size: "300 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGCONDITION.JPG",
  },
    {
    id: "Leavein-03",
    name: "Leave-in conditioner",
    price: 199,
    category: "Conditioner",
    description: "Ger näring och hjälper till att reda ut trassligt hår.",
    size: "300 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGLEAVEINCONDITION.JPG",
  },
   {
    id: "curl-cream-04",
    name: "Curl defining cream",
    price: 249,
    category: "Styling",
    description: "Definierar och återfuktar lockarna utan att tynga ner.",
    size: "150 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGCURLCREAM.JPG",
  },
  {
    id: "curl-gel-05",
    name: "Curl defining gel",
    price: 229,
    category: "Styling",
    description: "Ger stadga och definierar lockarna utan kladd.",
    size: "180 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGCURLGEL.JPG",
  },
  {
    id: "hair-oil-06",
    name: "Nourishing hair oil",
    price: 259,
    category: "Oils",
    description: "Ger glans och mjukhet till lockigt hår.",
    size: "100 ml",
    hairType: "Lockigt hår",
    image: "http://localhost:4000/uploads/CGCURLOIL.JPG",
  },
];

// GET all products, with optional search filter
app.get("/products", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// POST skapa produkt
app.post("/products", upload.single("image"), async (req, res) => {
  const { name, price, category, description, size, hairType } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const [result] = await pool.query(
      "INSERT INTO products (name, price, category, description, size, hairType, image) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, price, category, description, size, hairType, image]
    );
    res.status(201).json({ id: (result as any).insertId, name, price, category, description, size, hairType, image });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET produkt via ID
app.get("/products/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]) as [any[], any];
    if (rows.length === 0) return res.status(404).send("Product not found");
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT uppdatera produkt via ID
app.put("/products/:id", (req: Request, res: Response) => {
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).send("Produkt hittades inte");

  products[index] = { ...req.body, id: req.params.id };
  res.json(products[index]);
});

// DELETE produkt via ID
app.delete("/products/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

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

  const total = items.reduce((sum: number, item: Product) => sum + item.price, 0);
  const newOrder: Order = {
    id: uuidv4(),
    items,
    total,
  };

  orders.push(newOrder);
  res.status(201).json({ message: "Order placed", order: newOrder });
});

// Image upload endpoint
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const imageUrl = `http://localhost:${port}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});
