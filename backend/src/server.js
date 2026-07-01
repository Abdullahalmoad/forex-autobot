require('dotenv').config();
const express = require('express');
const cors = require('cors');

const accountsRouter = require('./routes/accounts.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/accounts', accountsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Forex AutoBot backend يعمل على المنفذ ${PORT}`);
});
