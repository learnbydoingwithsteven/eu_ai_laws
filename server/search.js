import { buildSearchIndex } from './lawLoader.js';

const documents = buildSearchIndex();
const tokenStats = new Map();
const docVectors = new Map();

function normaliseToken(token) {
  return token
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function tokenize(text) {
  return text
    .split(/\s+/)
    .map(normaliseToken)
    .filter(Boolean);
}

for (const doc of documents) {
  const tokens = tokenize(doc.text);
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  docVectors.set(doc.id, { counts, length: tokens.length, meta: doc });
  for (const token of new Set(tokens)) {
    tokenStats.set(token, (tokenStats.get(token) || 0) + 1);
  }
}

const totalDocs = documents.length;

function computeIdf(token) {
  const df = tokenStats.get(token) || 0;
  if (df === 0) return 0;
  return Math.log((totalDocs + 1) / (df + 1)) + 1;
}

function buildQueryVector(query) {
  const tokens = tokenize(query);
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return { counts, length: tokens.length };
}

export function searchDocuments(query, options = {}) {
  const { limit = 5, lawFilter } = options;
  const queryVector = buildQueryVector(query);
  const queryNorm = Math.sqrt(
    Array.from(queryVector.counts.entries()).reduce((sum, [token, tf]) => {
      const weight = tf * computeIdf(token);
      return sum + weight * weight;
    }, 0)
  );

  if (queryNorm === 0) {
    return [];
  }

  const scores = [];

  for (const [docId, vector] of docVectors.entries()) {
    if (lawFilter && lawFilter.length > 0 && !lawFilter.includes(vector.meta.lawId)) {
      continue;
    }

    let dot = 0;
    for (const [token, tfQuery] of queryVector.counts.entries()) {
      const docTf = vector.counts.get(token);
      if (!docTf) continue;
      const weightQuery = tfQuery * computeIdf(token);
      const weightDoc = docTf * computeIdf(token);
      dot += weightQuery * weightDoc;
    }

    if (dot === 0) continue;

    const docNorm = Math.sqrt(
      Array.from(vector.counts.entries()).reduce((sum, [token, tf]) => {
        const weight = tf * computeIdf(token);
        return sum + weight * weight;
      }, 0)
    );

    if (docNorm === 0) continue;

    const score = dot / (queryNorm * docNorm);
    scores.push({ id: docId, score, meta: vector.meta });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, limit);
}

export function getDocuments() {
  return documents;
}
