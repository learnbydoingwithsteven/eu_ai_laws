import { searchDocuments } from './search.js';

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';

function buildContextBlock(results) {
  if (!results || results.length === 0) {
    return 'No directly relevant provisions were found in the indexed texts.';
  }
  return results
    .map((result, index) => {
      const { meta } = result;
      return [
        `Source ${index + 1}: ${meta.lawTitle} — ${meta.articleLabel} (${meta.articleTitle})`,
        `Paragraph ${meta.paragraphNumber}: ${meta.text.split('\n').slice(-2).join(' ')}`,
      ].join('\n');
    })
    .join('\n\n');
}

export async function chatWithDocuments(payload) {
  const { messages = [], lawIds = [], model = DEFAULT_MODEL } = payload;
  const userMessages = messages.filter((msg) => msg.role === 'user');
  const latestUser = userMessages[userMessages.length - 1];
  const query = latestUser ? latestUser.content : '';

  const results = query
    ? searchDocuments(query, { limit: 5, lawFilter: lawIds.length ? lawIds : undefined })
    : [];

  const contextBlock = buildContextBlock(results);

  const systemPrompt = `You are a legal assistant specialising in EU and Italian AI regulation. Use only the provided context to answer. If the answer is not contained in the context, say so explicitly.`;

  const enhancedMessages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'system',
      content: `Context:\n${contextBlock}`,
    },
    ...messages,
  ];

  try {
    const response = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: enhancedMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = await response.json();
    const answer = data?.message?.content || 'No response received from Ollama.';
    return {
      answer,
      context: results,
    };
  } catch (error) {
    return {
      answer: `Unable to reach Ollama at ${OLLAMA_ENDPOINT}. Please ensure the service is running.\n\nContext summary:\n${contextBlock}`,
      context: results,
      error: error.message,
    };
  }
}
