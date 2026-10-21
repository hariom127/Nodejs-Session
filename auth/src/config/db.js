const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);
// Wrap any client-supplied object containing `$` operators in `$eq`, as a
// second line of defense against NoSQL operator injection.
mongoose.set('sanitizeFilter', true);

mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));
mongoose.connection.on('reconnected', () => console.log('[mongo] reconnected'));
mongoose.connection.on('error', (err) => console.error(`[mongo] ${err.message}`));

async function connectDb() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[mongo] connected to ${mongoose.connection.name}`);
}

async function disconnectDb() {
  await mongoose.connection.close();
}

module.exports = { connectDb, disconnectDb };
