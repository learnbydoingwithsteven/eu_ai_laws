import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGraph, listLawIds, loadLawMetadata, loadLaw } from './lawLoader.js';
import { chatWithDocuments } from './chat.js';
import { searchDocuments } from './search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/laws', (req, res) => {
  const metadata = listLawIds().map((lawId) => loadLawMetadata(lawId));
  res.json(metadata);
});

app.get('/api/laws/:lawId', (req, res) => {
  try {
    const law = loadLaw(req.params.lawId);
    res.json(law);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/graph', (req, res) => {
  const graph = buildGraph();
  res.json(graph);
});

app.get('/api/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q".' });
  }
  const lawFilter = req.query.law ? req.query.law.split(',').filter(Boolean) : undefined;
  const results = searchDocuments(query, {
    limit: Number.parseInt(req.query.limit, 10) || 5,
    lawFilter,
  }).map((item) => ({
    id: item.id,
    score: item.score,
    lawId: item.meta.lawId,
    lawTitle: item.meta.lawTitle,
    articleLabel: item.meta.articleLabel,
    articleTitle: item.meta.articleTitle,
    paragraphNumber: item.meta.paragraphNumber,
    excerpt: item.meta.text,
  }));
  res.json(results);
});

app.post('/api/chat', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await chatWithDocuments(payload);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`EU AI laws explorer listening on port ${port}`);
});
