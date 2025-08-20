import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Allow SharePoint to embed this site (set your real tenant below in Render env vars)
const spTenant = process.env.SP_TENANT_ORIGIN || 'https://yourtenant.sharepoint.com';
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'", "https://api.monday.com"],
      "frame-ancestors": ["'self'", spTenant]
    }
  }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Data endpoint (no secrets in the browser) ---
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const MAIN_BOARD_ID = process.env.MAIN_BOARD_ID;

const formatDate = iso => {
  if (!iso || !iso.includes('-')) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

app.get('/api/milestones', async (_req, res) => {
  try {
    const query = `
      query {
        boards(ids: ${MAIN_BOARD_ID}) {
          items_page(limit: 200) {
            items {
              name
              column_values { id text value }
              subitems { name column_values { id text value } }
            }
          }
        }
      }
    `;
    const r = await axios.post(MONDAY_API_URL, { query }, {
      headers: { Authorization: MONDAY_API_KEY, 'Content-Type': 'application/json' }
    });

    const items = r.data?.data?.boards?.[0]?.items_page?.items || [];
    const rows = items.map(it => {
      const dateCol = it.column_values.find(c => c.id === 'date4');
      const descCol = it.column_values.find(c => c.id === 'long_text_mkp52kd7');
      return {
        name: it.name,
        date: formatDate(dateCol?.text || ''),
        description: descCol?.text || '',
        subcount: it.subitems?.length || 0
      };
    });

    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: 'Failed to load data' });
  }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
