// server.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS (allow SharePoint or all while testing) ---
const SHAREPOINT_ORIGIN = process.env.SHAREPOINT_ORIGIN || '*';
const corsOrigin =
  SHAREPOINT_ORIGIN === '*'
    ? '*'
    : SHAREPOINT_ORIGIN.split(',').map(s => s.trim());
app.use(cors({ origin: corsOrigin }));

app.use(express.json());

// --- Health for Render ---
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// --- Static frontend (supports either /index.html or /public/index.html) ---
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

const rootIndex   = path.join(__dirname, 'index.html');
const publicIndex = path.join(__dirname, 'public', 'index.html');
const indexPath   = fs.existsSync(rootIndex)
  ? rootIndex
  : (fs.existsSync(publicIndex) ? publicIndex : null);

app.get('/', (_req, res) => {
  if (indexPath) return res.sendFile(indexPath);
  res.status(404).send('index.html not found. Add index.html at repo root or in /public and redeploy.');
});

// ===== Monday.com (optional) =====
const MONDAY_API_URL   = 'https://api.monday.com/v2';
const MONDAY_API_KEY   = process.env.MONDAY_API_KEY;
const MAIN_BOARD_ID    = process.env.MAIN_BOARD_ID;      // e.g. 1987359239
// SUBITEMS_BOARD_ID can exist but isn't required by this query
// const SUBITEMS_BOARD_ID = process.env.SUBITEMS_BOARD_ID;

// Helper: DD/MM/YYYY from ISO
function formatDate(iso) {
  if (!iso || !iso.includes('-')) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

// Fetch + shape data from Monday (only if creds present)
async function fetchMilestonesFromMonday() {
  const query = `
    query {
      boards(ids: ${MAIN_BOARD_ID}) {
        items_page(limit: 200) {
          items {
            id
            name
            column_values { id text }
            subitems {
              id
              name
              column_values { id text value }
            }
          }
        }
      }
    }
  `;

  const resp = await axios.post(
    MONDAY_API_URL,
    { query },
    {
      headers: {
        Authorization: MONDAY_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  const board = resp.data?.data?.boards?.[0];
  const items = board?.items_page?.items || [];

  // Shape into the structure the frontend expects
  return items.map(item => {
    const descriptionCol = item.column_values.find(c => c.id === 'long_text_mkp52kd7');
    const dateCol        = item.column_values.find(c => c.id === 'date4');
    const portfolioCol   = item.column_values.find(c => c.id === 'dropdown_mkp5e1h0');

    const subitems = (item.subitems || []).map(sub => {
      const sponsorCol  = sub.column_values.find(c => c.id === 'person');
      const leadCol     = sub.column_values.find(c => c.id === 'multiple_person_mkr3784v');
      const timelineCol = sub.column_values.find(c => c.id === 'timerange_mkpca05e');
      const statusCol   = sub.column_values.find(c => c.id === 'status');

      let timeline = '';
      if (timelineCol?.value) {
        try {
          const val = JSON.parse(timelineCol.value);
          const from = formatDate(val.from);
          const to   = formatDate(val.to);
          if (from && to) timeline = `${from} – ${to}`;
        } catch {}
      }

      return {
        name: sub.name,
        sponsor: sponsorCol?.text || '',
        lead: leadCol?.text || '',
        timeline,
        status: statusCol?.text || ''
      };
    });

    return {
      name: item.name,
      description: descriptionCol?.text || '',
      date: formatDate(dateCol?.text || ''),
      portfolio: portfolioCol?.text || '',
      subitems
    };
  });
}

// --- API: milestones ---
app.get('/api/milestones', async (_req, res) => {
  try {
    if (MONDAY_API_KEY && MAIN_BOARD_ID) {
      const items = await fetchMilestonesFromMonday();
      return res.json({ success: true, items });
    }
    // No Monday creds yet → return empty dataset (page still loads cleanly)
    return res.json({ success: true, items: [] });
  } catch (err) {
    console.error('Error /api/milestones:', err?.response?.data || err);
    res.json({ success: false, error: 'Failed to load milestones' });
  }
});

// --- Start server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});

