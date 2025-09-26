import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "flamingofg13",
  database: "curlygurl_db",
});
