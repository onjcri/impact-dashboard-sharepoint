// server.js
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

// CORS (allow SharePoint page to embed/call this)
const SHAREPOINT_ORIGIN = process.env.SHAREPOINT_ORIGIN || '*';
app.use(cors({ origin: SHAREPOINT_ORIGIN, credentials: false }));

app.use(express.json());

// --- API: milestones (keep your existing data loader here) ---
app.get('/api/milestones', async (req, res) => {
  try {
    // TODO: replace this with your real data fetching
    // Example shape expected by frontend:
    // { success:true, items:[{name, description, portfolio, date, subitems:[{name,status,sponsor,lead,timeline}]}] }
    res.json({ success: true, items: [] });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: 'Failed to load milestones' });
  }
});

// --- Health check (Render) ---
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
