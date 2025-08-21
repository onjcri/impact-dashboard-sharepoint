// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS (let SharePoint embed/call this) ---
const SHAREPOINT_ORIGIN = process.env.SHAREPOINT_ORIGIN || '*';
// You can allow multiple origins by comma-separating them in env.
const allowed = SHAREPOINT_ORIGIN === '*'
  ? '*'
  : SHAREPOINT_ORIGIN.split(',').map(s => s.trim());
app.use(cors({ origin: allowed, credentials: false }));

app.use(express.json());

// --- Health check for Render ---
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// --- Static frontend (serve repo root since index.html is at root) ---
app.use(express.static(path.join(__dirname)));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- MONDAY.COM WIRING ----------
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const MAIN_BOARD_ID = process.env.MAIN_BOARD_ID;

function formatDate(iso) {
  if (!iso || !iso.includes('-')) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

async function fetchFromMonday(query) {
  const resp = await axios.post(
    MONDAY_API_URL,
    { query },
    { headers: { Authorization: MONDAY_API_KEY, 'Content-Type': 'application/json' } }
  );
  return resp.data;
}

app.get('/api/milestones', async (_req, res) => {
  try {
    if (!MONDAY_API_KEY || !MAIN_BOARD_ID) {
      return res.json({ success: false, error: 'Missing MONDAY_API_KEY or MAIN_BOARD_ID' });
    }

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

    const data = await fetchFromMonday(query);
    if (!data || data.errors) {
      return res.json({ success: false, error: 'Failed to fetch data from Monday.com' });
    }

    const items = data.data?.boards?.[0]?.items_page?.items || [];

    const formatted = items.map(item => {
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
            const v = JSON.parse(timelineCol.value);
            const from = formatDate(v.from);
            const to   = formatDate(v.to);
            if (from && to) timeline = `${from} – ${to}`;
          } catch (_) {}
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

    res.json({ success: true, items: formatted });
  } catch (e) {
    console.error(e?.response?.data || e);
    res.json({ success: false, error: 'Internal error loading milestones' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
