'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const routes = require('./routes');
const scheduler = require('./scheduler');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`meinibis-essensplan läuft auf http://localhost:${PORT}`);
});

scheduler.start();
