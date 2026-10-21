const EventEmitter = require('node:events');
const { Router } = require('express');

// Demo routes for showing how process-level error handlers in server.js behave.
// Mounted only outside production (see app.js).
const router = Router();

// Thrown inside a route: Express catches it and passes it to errorHandler.
// process.on('uncaughtException') is NOT called.
router.get('/route-error', () => {
  throw new Error('thrown inside a route handler');
});

// Thrown inside a timer callback: the route has already returned, so neither
// Express nor try/catch can catch it -> process.on('uncaughtException').
router.get('/timer-error', (req, res) => {
  setTimeout(() => {
    throw new Error('thrown inside setTimeout');
  }, 100);
  res.json({ success: true, data: { message: 'error will be thrown in 100ms' } });
});

// 'error' event with no listener: Node throws it -> process.on('uncaughtException').
router.get('/emitter-error', (req, res) => {
  const emitter = new EventEmitter();
  setImmediate(() => emitter.emit('error', new Error('unhandled "error" event')));
  res.json({ success: true, data: { message: 'emitting "error" with no listener' } });
});

// Promise rejected with no .catch(): -> process.on('unhandledRejection').
router.get('/promise-error', (req, res) => {
  Promise.reject(new Error('rejected promise with no catch'));
  res.json({ success: true, data: { message: 'promise rejected without a catch' } });
});

module.exports = router;
