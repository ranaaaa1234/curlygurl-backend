import pkg from "pg";
const { Pool } = pkg;

import dotenv from "dotenv";
dotenv.config(); 

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "curlygurl",
  port: Number(process.env.DB_PORT) || 5432,
});

pool.on("connect", () => {
  console.log("Connected to the database");
});
