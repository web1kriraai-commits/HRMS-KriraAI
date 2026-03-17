import dotenv from 'dotenv';
dotenv.config();
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('MONGODB_DB_NAME:', process.env.MONGODB_DB_NAME);
console.log('PORT:', process.env.PORT);
