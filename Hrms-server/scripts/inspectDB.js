import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'hrms' });

// List all collections
const collections = await mongoose.connection.db.listCollections().toArray();
console.log('Collections:', collections.map(c => c.name));

// Count docs in each
for (const col of collections) {
    const count = await mongoose.connection.db.collection(col.name).countDocuments();
    console.log(`  ${col.name}: ${count} docs`);
}

// Sample users
const users = await mongoose.connection.db.collection('users').find({}).limit(20).toArray();
console.log('\nUsers:', users.map(u => `${u.name}(${u.role}, active=${u.isActive})`));

// Sample attendance
const att = await mongoose.connection.db.collection('attendances').find({}).limit(10).sort({ date: -1 }).toArray();
console.log('\nSample attendance:', att.map(a => `date=${a.date},user=${a.userId},in=${!!a.checkIn},out=${!!a.checkOut}`));

await mongoose.disconnect();
