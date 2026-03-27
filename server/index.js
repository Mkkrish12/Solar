require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeCache } = require('./cache/startup');
const evaluateRouter = require('./routes/evaluate');
const mapStaticRouter = require('./routes/mapStatic');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', evaluateRouter);
app.use('/api', mapStaticRouter);

async function start() {
  console.log('🚀 Initializing data caches...');
  try {
    await initializeCache();
    console.log('✅ Cache initialization complete');
  } catch (err) {
    console.warn('⚠️  Cache initialization partial — some data may be estimated:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🌞 GoSolar API running on port ${PORT}`);
  });
}

start();
