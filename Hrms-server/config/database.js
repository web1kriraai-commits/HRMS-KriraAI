import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// On some machines Node's built-in resolver (c-ares) defaults to 127.0.0.1,
// where nothing is listening, so mongodb+srv SRV lookups fail with
// "querySrv ECONNREFUSED". Point Node at public DNS servers that support
// SRV records. Override via DNS_SERVERS="1.1.1.1,8.8.8.8" if needed.
const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
try {
  dns.setServers(dnsServers);
} catch (err) {
  console.warn('Could not set custom DNS servers:', err.message);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'hrms'
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

export default connectDB;



