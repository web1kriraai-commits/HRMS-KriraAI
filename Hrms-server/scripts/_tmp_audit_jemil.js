import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });
const db = mongoose.connection.db;
const logs = await db.collection('auditlogs').find({
  userName: /Jemil/i,
  action: { $in: ['REQUEST_EARLY_OVERTIME', 'REQUEST_EARLY_CHECKOUT'] },
  createdAt: { $gte: new Date('2026-07-07T00:00:00Z'), $lt: new Date('2026-07-08T00:00:00Z') },
}).sort({ createdAt: 1 }).toArray();
console.log(JSON.stringify(logs.map(l => ({ action: l.action, details: l.details, createdAt: l.createdAt })), null, 2));
await mongoose.disconnect();
