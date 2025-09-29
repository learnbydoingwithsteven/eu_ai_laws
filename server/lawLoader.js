import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

function ensureLawExists(lawId) {
  const lawDir = path.join(dataDir, lawId);
  if (!fs.existsSync(lawDir)) {
    throw new Error(`Unknown law: ${lawId}`);
  }
  return lawDir;
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function loadText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

export function listLawIds() {
  return fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadLawMetadata(lawId) {
  const lawDir = ensureLawExists(lawId);
  const articleFile = path.join(lawDir, 'articles.json');
  const articleData = loadJson(articleFile);
  return {
    lawId: articleData.lawId,
    title: articleData.title,
    citation: articleData.citation,
  };
}

export function loadLaw(lawId) {
  const lawDir = ensureLawExists(lawId);
  const articleData = loadJson(path.join(lawDir, 'articles.json'));
  const text = loadText(path.join(lawDir, 'text.md'));
  return {
    ...articleData,
    text,
  };
}

export function loadAllArticles() {
  const result = [];
  for (const lawId of listLawIds()) {
    const { articles, title, citation } = loadLaw(lawId);
    for (const article of articles) {
      result.push({
        lawId,
        lawTitle: title,
        lawCitation: citation,
        ...article,
      });
    }
  }
  return result;
}

export function buildGraph() {
  const nodes = [];
  const edges = [];
  const nodeIndex = new Map();

  const articles = loadAllArticles();

  for (const article of articles) {
    const node = {
      id: article.id,
      lawId: article.lawId,
      label: article.label,
      title: article.title,
      lawTitle: article.lawTitle,
    };
    nodes.push(node);
    nodeIndex.set(article.id, node);
  }

  // track missing references for stub nodes
  const missing = new Map();

  for (const article of articles) {
    if (!article.references) continue;
    for (const ref of article.references) {
      if (!nodeIndex.has(ref) && !missing.has(ref)) {
        missing.set(ref, {
          id: ref,
          lawId: 'external',
          label: ref,
          title: 'Referenced provision not present in dataset',
          lawTitle: 'External reference',
        });
      }
      edges.push({
        source: article.id,
        target: ref,
      });
    }
  }

  nodes.push(...missing.values());

  return { nodes, edges };
}

export function buildSearchIndex() {
  const articles = loadAllArticles();
  const documents = [];

  for (const article of articles) {
    const base = `${article.label} ${article.title}`;
    for (const paragraph of article.paragraphs) {
      const text = [
        base,
        `Paragraph ${paragraph.number}`,
        paragraph.text,
        ...(paragraph.points || []),
      ].join('\n');
      documents.push({
        id: `${article.id}#${paragraph.number}`,
        lawId: article.lawId,
        lawTitle: article.lawTitle,
        articleLabel: article.label,
        articleTitle: article.title,
        paragraphNumber: paragraph.number,
        text,
      });
    }
  }

  return documents;
}
