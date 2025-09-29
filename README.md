# EU & Italian AI Law Navigator

This project provides a visual knowledge base for core EU and Italian AI regulations. It combines:

- Structured datasets for the GDPR, the adopted EU AI Act and the 2024 Italian Garante Privacy guidelines on AI and data protection (each stored in its own folder under `data/`).
- An interactive front-end that renders a force-directed graph linking related provisions and lets you browse the underlying articles.
- A lightweight search index and chat endpoint that forward grounded context to a local [Ollama](https://ollama.com) model so you can interrogate the corpus with natural language questions.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server (serves both the API and static front-end):

   ```bash
   npm run dev
   ```

   By default the app listens on [http://localhost:3000](http://localhost:3000).

3. (Optional) Override the Ollama endpoint or model:

   ```bash
   OLLAMA_ENDPOINT=http://localhost:11434 OLLAMA_MODEL=llama3 npm run dev
   ```

   The chat endpoint will fall back to a helpful error message if the Ollama API is unreachable.

## Project structure

```
.
├── data/
│   ├── gdpr/
│   ├── eu_ai_act/
│   └── italian_ai_guidelines/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server/
│   ├── chat.js
│   ├── lawLoader.js
│   ├── search.js
│   └── server.js
├── package.json
└── README.md
```

- Each folder in `data/` contains `text.md` with the consolidated legal provisions and `articles.json` describing key articles, paragraphs, points and cross-references.
- `server/` loads the datasets, builds a TF-IDF search index and exposes REST endpoints used by the front-end.
- `public/` hosts the standalone UI implemented with modern browser APIs, D3.js for the graph, and vanilla JavaScript.

## API overview

- `GET /api/laws` — List all laws with title and citation.
- `GET /api/laws/:lawId` — Retrieve the full article structure and plain-text content for a specific law.
- `GET /api/graph` — Obtain the graph nodes and edges linking referenced articles/sections.
- `GET /api/search?q=...&law=gdpr,eu_ai_act` — Search paragraphs using cosine similarity over a TF-IDF index.
- `POST /api/chat` — Forward chat history, relevant law filters and the desired Ollama model; the server enriches the request with retrieved context before calling Ollama.

## Notes

- All datasets included here reproduce public legal texts or official guidance and can be extended by adding new sub-folders under `data/`.
- The client uses the currently selected law filters when searching or chatting so that investigations can focus on a subset of the framework.
- When Ollama is offline, the chat panel will display an actionable message containing the retrieved legal context to help manual analysis.
