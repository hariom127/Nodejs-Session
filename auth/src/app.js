const express = require('express');
const mongoose = require('mongoose');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const errorRoutes = require('./routes/errorRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { redisClient } = require('./config/redis');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const redis = redisClient.isReady ? 'up' : 'down';
  const healthy = mongo === 'up' && redis === 'up';
  res.status(healthy ? 200 : 503).json({ success: healthy, data: { service: 'auth', mongo, redis } });
});

app.use('/api/auth', authRoutes);

// error demo routes: never expose in production (they can crash the process)
if (env.nodeEnv !== 'production') {
  app.use('/api/demo/errors', errorRoutes);
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
