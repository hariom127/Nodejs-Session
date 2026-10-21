const express = require('express');
const mongoose = require('mongoose');
const postRoutes = require('./routes/postRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { redisClient } = require('./config/redis');

const app = express();

//This line turns that header off. The header does nothing for your app, and it tells anyone looking that you run Express, which helps attackers target known Express or Node.js weaknesses. Removing it is a common, cheap hardening step.
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const redis = redisClient.isReady ? 'up' : 'down';
  const healthy = mongo === 'up' && redis === 'up';
  res.status(healthy ? 200 : 503).json({ success: healthy, data: { service: 'post', mongo, redis } });
});

app.use('/api/posts', postRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
