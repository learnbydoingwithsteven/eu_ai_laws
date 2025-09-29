const state = {
  laws: [],
  graph: null,
  selectedLaws: new Set(),
  simulation: null,
  lawCache: new Map(),
  chatHistory: [],
};

const svg = document.getElementById('law-graph');
const articleTitleEl = document.getElementById('article-title');
const articleContentEl = document.getElementById('article-content');
const lawTextSelectEl = document.getElementById('law-text-select');
const lawTextEl = document.getElementById('law-text');
const chatLogEl = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const lawFiltersEl = document.getElementById('law-filters');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const modelInput = document.getElementById('ollama-model');

function createCheckbox(law) {
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.value = law.lawId;
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.selectedLaws.add(law.lawId);
    } else {
      state.selectedLaws.delete(law.lawId);
    }
    renderGraph();
  });
  state.selectedLaws.add(law.lawId);

  const span = document.createElement('span');
  span.textContent = `${law.title} (${law.citation})`;

  label.appendChild(checkbox);
  label.appendChild(span);
  return label;
}

async function loadLaws() {
  const response = await fetch('/api/laws');
  const laws = await response.json();
  state.laws = laws;
  lawFiltersEl.innerHTML = '';
  laws.forEach((law) => {
    lawFiltersEl.appendChild(createCheckbox(law));
    const option = document.createElement('option');
    option.value = law.lawId;
    option.textContent = `${law.title} — ${law.citation}`;
    lawTextSelectEl.appendChild(option);
  });
}

async function loadGraph() {
  const response = await fetch('/api/graph');
  state.graph = await response.json();
  renderGraph();
}

function getSelectedLawIds() {
  return Array.from(state.selectedLaws);
}

function buildColourScale(nodes) {
  const lawIds = Array.from(new Set(nodes.map((node) => node.lawId))).filter(
    (id) => id !== 'external'
  );
  const palette = d3.schemeTableau10;
  const scale = d3.scaleOrdinal(palette).domain(lawIds);
  return (node) => (node.lawId === 'external' ? '#94a3b8' : scale(node.lawId));
}

async function showArticle(nodeId) {
  if (!nodeId) return;
  let targetNode = null;
  if (state.graph) {
    targetNode = state.graph.nodes.find((node) => node.id === nodeId);
  }
  if (!targetNode || targetNode.lawId === 'external') {
    articleTitleEl.textContent = 'Reference outside dataset';
    articleContentEl.textContent = 'The selected node references provisions that are not fully captured in the dataset.';
    return;
  }

  const law = await fetchLaw(targetNode.lawId);
  const article = law.articles.find((item) => item.id === nodeId);
  if (!article) {
    articleTitleEl.textContent = targetNode.label;
    articleContentEl.textContent = 'Article details not found.';
    return;
  }
  articleTitleEl.textContent = `${article.label} — ${article.title}`;
  const textBlocks = article.paragraphs.map((paragraph) => {
    const points = (paragraph.points || [])
      .map((point, index) => `    ${String.fromCharCode(97 + index)}. ${point}`)
      .join('\n');
    return [`Paragraph ${paragraph.number}`, paragraph.text, points].filter(Boolean).join('\n');
  });
  articleContentEl.textContent = textBlocks.join('\n\n');
}

function resizeSvg() {
  const rect = svg.getBoundingClientRect();
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height || 420);
  return { width: rect.width, height: rect.height || 420 };
}

function renderGraph() {
  if (!state.graph) return;

  const selected = getSelectedLawIds();
  const hasFilter = selected.length > 0;
  const baseEdges = state.graph.edges.map((edge) => ({
    source: typeof edge.source === 'object' ? edge.source.id : edge.source,
    target: typeof edge.target === 'object' ? edge.target.id : edge.target,
  }));
  const nodeIndex = new Map(state.graph.nodes.map((node) => [node.id, node]));

  const filteredNodes = state.graph.nodes.filter((node) => {
    if (!hasFilter) return true;
    if (node.lawId === 'external') {
      return baseEdges.some((edge) => {
        if (edge.source === node.id) {
          const otherNode = nodeIndex.get(edge.target);
          return otherNode && selected.includes(otherNode.lawId);
        }
        if (edge.target === node.id) {
          const otherNode = nodeIndex.get(edge.source);
          return otherNode && selected.includes(otherNode.lawId);
        }
        return false;
      });
    }
    return selected.includes(node.lawId);
  });

  const nodeSet = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = baseEdges.filter(
    (edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target)
  );

  const { width, height } = resizeSvg();
  const svgSelection = d3.select(svg);
  svgSelection.selectAll('*').remove();

  const colour = buildColourScale(filteredNodes);

  const simulation = d3
    .forceSimulation(filteredNodes.map((node) => ({ ...node })))
    .force(
      'link',
      d3
        .forceLink(filteredEdges.map((edge) => ({ ...edge })))
        .id((d) => d.id)
        .distance(120)
    )
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(60));

  const link = svgSelection
    .append('g')
    .attr('stroke', '#1e293b')
    .attr('stroke-opacity', 0.4)
    .selectAll('line')
    .data(filteredEdges)
    .join('line')
    .attr('stroke-width', 1.2);

  const node = svgSelection
    .append('g')
    .selectAll('g')
    .data(filteredNodes)
    .join('g')
    .call(
      d3
        .drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  node
    .append('circle')
    .attr('r', 18)
    .attr('fill', (d) => colour(d))
    .attr('stroke', '#0f172a')
    .attr('stroke-width', 1.5)
    .on('click', (_, d) => showArticle(d.id));

  node
    .append('text')
    .text((d) => d.label)
    .attr('x', 24)
    .attr('dy', '0.35em')
    .attr('fill', '#e2e8f0')
    .style('font-size', '0.75rem');

  node.append('title').text((d) => `${d.lawTitle}\n${d.title}`);

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
  });

  state.simulation = simulation;
}

async function fetchLaw(lawId) {
  if (state.lawCache.has(lawId)) {
    return state.lawCache.get(lawId);
  }
  const response = await fetch(`/api/laws/${lawId}`);
  if (!response.ok) {
    throw new Error(`Failed to load law ${lawId}`);
  }
  const law = await response.json();
  state.lawCache.set(lawId, law);
  return law;
}

lawTextSelectEl.addEventListener('change', async () => {
  const lawId = lawTextSelectEl.value;
  if (!lawId) {
    lawTextEl.textContent = '';
    return;
  }
  try {
    const law = await fetchLaw(lawId);
    lawTextEl.textContent = law.text;
  } catch (error) {
    lawTextEl.textContent = error.message;
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  searchResultsEl.textContent = 'Searching…';
  try {
    const params = new URLSearchParams({ q: query, limit: '6' });
    const selected = getSelectedLawIds();
    if (selected.length) {
      params.set('law', selected.join(','));
    }
    const response = await fetch(`/api/search?${params.toString()}`);
    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      searchResultsEl.textContent = 'No matching provisions found in the selected materials.';
      return;
    }
    searchResultsEl.innerHTML = '';
    results.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'search-result';
      const title = document.createElement('strong');
      title.textContent = `${item.lawTitle} — ${item.articleLabel}`;
      const excerpt = document.createElement('div');
      const snippet = item.excerpt.replace(/\n+/g, ' ');
      excerpt.textContent = snippet.slice(0, 240) + (snippet.length > 240 ? '…' : '');
      div.appendChild(title);
      div.appendChild(document.createElement('br'));
      div.appendChild(excerpt);
      div.addEventListener('click', () => showArticle(item.id.split('#')[0]));
      searchResultsEl.appendChild(div);
    });
  } catch (error) {
    searchResultsEl.textContent = `Search failed: ${error.message}`;
  }
});

function appendChatMessage(role, content) {
  const message = document.createElement('div');
  message.className = `chat-message ${role}`;
  message.textContent = content;
  chatLogEl.appendChild(message);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;
  appendChatMessage('user', content);
  chatInput.value = '';

  state.chatHistory.push({ role: 'user', content });
  appendChatMessage('assistant', 'Thinking…');
  const placeholder = chatLogEl.lastElementChild;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chatHistory,
        lawIds: getSelectedLawIds(),
        model: modelInput.value.trim() || undefined,
      }),
    });
    const data = await response.json();
    const answer = data.answer || 'No answer returned.';
    placeholder.textContent = answer;
    state.chatHistory.push({ role: 'assistant', content: answer });
  } catch (error) {
    placeholder.textContent = `Chat failed: ${error.message}`;
  }
});

window.addEventListener('resize', () => {
  if (state.simulation) {
    renderGraph();
  }
});

(async function init() {
  await loadLaws();
  await loadGraph();
})();
