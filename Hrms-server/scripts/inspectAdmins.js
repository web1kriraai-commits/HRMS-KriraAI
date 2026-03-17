import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });

const db = mongoose.connection.db;
const users = await db.collection('users').find({ role: 'Admin' }).toArray();

console.log('Admin-like Users:');
users.forEach(u => {
    console.log(`ID: ${u._id}, Name: ${u.name}, Username: ${u.username}, Email: ${u.email}, Role: ${u.role}, Active: ${u.isActive}, isFirstLogin: ${u.isFirstLogin}`);
});

await mongoose.disconnect();
