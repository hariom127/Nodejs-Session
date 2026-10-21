// Demo: when does process.on('uncaughtException') fire?
//
//   node examples/uncaught-exception-demo.js              -> handler installed, server survives
//   node examples/uncaught-exception-demo.js --no-handler -> no handler, process crashes
//
// Then, in another terminal:
//   curl localhost:4000/route-error    -> Express catches it (500), handler NOT called
//   curl localhost:4000/timer-error    -> throw inside setTimeout -> uncaughtException
//   curl localhost:4000/emitter-error  -> 'error' event with no listener -> uncaughtException
//   curl localhost:4000/health         -> still alive?

const EventEmitter = require('node:events');
const express = require('express');

const PORT = 4000;
const withHandler = !process.argv.includes('--no-handler');

const app = express();

// 1. Error thrown inside a route: Express catches it and sends a 500.
//    It never reaches process.on('uncaughtException').
app.get('/route-error', () => {
  throw new Error('thrown inside a route handler');
});

// 2. Error thrown in a callback that runs later (timer, socket, fs callback...).
//    By then the route has returned, so neither Express nor try/catch can catch it.
app.get('/timer-error', (req, res) => {
  try {
    setTimeout(() => {
      throw new Error('thrown inside setTimeout');
    }, 100);
  } catch (err) {
    console.log('this never runs: try/catch cannot catch async callbacks');
  }
  res.json({ message: 'response sent, error will be thrown in 100ms' });
});

// 3. An EventEmitter emits 'error' and nobody listens for it.
//    Node turns that into a thrown exception.
app.get('/emitter-error', (req, res) => {
  const emitter = new EventEmitter();
  res.json({ message: 'emitting "error" with no listener' });
  setImmediate(() => emitter.emit('error', new Error('unhandled "error" event')));
});

app.get('/health', (req, res) => res.json({ status: 'ok', pid: process.pid }));

if (withHandler) {
  process.on('uncaughtException', (err) => {
    console.error('[auth] uncaught exception', err);
  });
}

app.listen(PORT, () => {
  console.log(`[demo] listening on http://localhost:${PORT} (handler ${withHandler ? 'ON' : 'OFF'})`);
});
