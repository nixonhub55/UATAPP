import mariadb from 'mariadb';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'PfNgB@y@n',
  database: process.env.DB_NAME || 'uat_monitoring',
  connectionLimit: 10,
  acquireTimeout: 10000,
  bigIntAsNumber: true
});

export async function query(sql, params = []) {
  let conn;
  try {
    conn = await pool.getConnection();
    return await conn.query(sql, params);
  } finally {
    if (conn) conn.release();
  }
}
