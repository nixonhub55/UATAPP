import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from './db.js';

try {
  const email = 'admin@uat.local';
  const existing = await query('SELECT id FROM users WHERE email=?', [email]);
  if (existing.length) {
    console.log(`Admin account already exists: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
    await query('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',
      ['UAT Administrator', email, passwordHash, 'PROJECT_INCHARGE']);
    console.log(`Created Project Incharge: ${email}`);
    console.log('Temporary password: ChangeMe123! — change it after login.');
  }
} catch (e) {
  console.error('Could not seed admin. Check .env and database/schema.sql.', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
