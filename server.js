// server.js
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

/* -------------------- Config -------------------- */
const PORT = process.env.PORT || 10000;
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const MAIN_BOARD_ID = process.env.MAIN_BOARD_ID;
const SHAREPOINT_ORIGIN = process.env.SHAREPOINT_ORIGIN || '*';

/* -------------------- Middleware -------------------- */
app.use(cors({ origin: SHAREPOINT_ORIGIN, credentials: false }));
app.use(express.json());

/* -------------------- Helpers -------------------- */
function formatDate(iso) {
  if (!iso || !iso.includes('-')) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

async function fetchFromMonday(query) {
  if (!MONDAY_API_KEY || !MAIN_BOARD_ID) {
    throw new Error('Missing MONDAY_API_KEY or MAIN_BOARD_ID env var');
  }

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: MONDAY_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    const msg = json?.errors?.map(e => e.message).join(' | ') || res.statusText;
    throw new Error(`Monday.com error: ${msg}`);
  }
  return json;
}

/* -------------------- API -------------------- */
/**
 * Returns:
 * {
 *   success: true,
 *   items: [
 *     { name, description, portfolio, date, subitems:[{name,status,sponsor,lead,timeline}] }
 *   ]
 * }
 */
app.get('/api/milestones', async (_req, res) => {
  try {
    const query = `
      query {
        boards(ids: ${MAIN_BOARD_ID}) {
          items_page(limit: 200) {
            items {
              id
              name
              column_values {
                id
                text
              }
              subitems {
                id
                name
                column_values {
                  id
                  text
                  value
                }
              }
            }
          }
        }
      }
    `;

    const data = await fetchFromMonday(query);
    const items = data?.data?.boards?.[0]?.items_page?.items || [];

    // Column IDs kept exactly as you used them previously
    const formattedItems = items.map(item => {
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
          } catch (_) { /* ignore parse error */ }
        }

        return {
          name: sub.name,
          sponsor: sponsorCol?.text || '',
          lead: leadCol?.text || '',
          timeline,
          status: statusCol?.text || '',
        };
      });

      return {
        name: item.name,
        description: descriptionCol?.text || '',
        date: formatDate(dateCol?.text || ''),
        portfolio: portfolioCol?.text || '',
        subitems,
      };
    });

    res.json({ success: true, items: formattedItems });
  } catch (err) {
    console.error('[/api/milestones] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load milestones' });
  }
});

/* -------------------- Health check for Render -------------------- */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

/* -------------------- Static frontend -------------------- */
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all to serve the SPA (must be AFTER API routes)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* -------------------- Start -------------------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
