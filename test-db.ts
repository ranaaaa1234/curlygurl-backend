import { pool } from "./src/db";

async function test() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("DB connected! Time:", res.rows[0]);
  } catch (err) {
    console.error("DB connection error:", err);
  }
  process.exit();
}

test();
