/**
 * Mock LLM API Server for Testing
 * Simulates Claude API responses for comment generation
 */

import http from 'http';

const PORT = process.env.MOCK_PORT || 3001;

// Simulate different response scenarios
let responseMode = 'success'; // 'success' | 'error' | 'timeout' | 'malformed'

const mockResponses = {
  success: {
    id: 'mock-msg-001',
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'text',
      text: JSON.stringify({
        tweet_language: 'en',
        recommended: 'B',
        replies: {
          A: {
            text: 'Test witty reply about email productivity! 📧',
            explanation: 'A playful response that engages with the tweet',
            cn_translation: '关于邮件生产力的机智回复！📧'
          },
          B: {
            text: 'Great point about inbox management. AI tools can really help with email triage.',
            explanation: 'A practical response offering value',
            cn_translation: '关于收件箱管理的好观点。AI工具确实可以帮助邮件分类。'
          },
          C: {
            text: 'This is exactly why we built Filo - to solve inbox overload with AI.',
            explanation: 'A subtle product mention that addresses the pain point',
            cn_translation: '这正是我们构建Filo的原因——用AI解决收件箱过载问题。'
          }
        }
      })
    }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 500,
      output_tokens: 300
    }
  },
  
  error: {
    type: 'error',
    error: {
      type: 'api_error',
      message: 'Mock API error for testing'
    }
  },
  
  malformed: {
    id: 'mock-msg-002',
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'text',
      text: 'This is not valid JSON and should cause parsing to fail'
    }]
  },
  
  empty: {
    id: 'mock-msg-003',
    type: 'message',
    role: 'assistant',
    content: []
  }
};

const server = http.createServer((req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Control endpoint for tests to change behavior
  if (req.url === '/control' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { mode } = JSON.parse(body);
        if (['success', 'error', 'timeout', 'malformed', 'empty'].includes(mode)) {
          responseMode = mode;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', mode: responseMode }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid mode' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Status endpoint
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', mode: responseMode, port: PORT }));
    return;
  }
  
  // Mock Claude API endpoint
  if (req.url === '/mock' && req.method === 'POST') {
    // Timeout simulation
    if (responseMode === 'timeout') {
      // Don't respond - let the client timeout
      return;
    }
    
    // Error simulation
    if (responseMode === 'error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockResponses.error));
      return;
    }
    
    // Parse request body (for logging/debugging)
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        console.log(`[Mock Server] Received request for model: ${requestData.model}`);
        console.log(`[Mock Server] Messages count: ${requestData.messages?.length || 0}`);
      } catch (e) {
        console.log('[Mock Server] Could not parse request body');
      }
      
      // Add artificial delay to simulate network latency
      setTimeout(() => {
        const response = mockResponses[responseMode] || mockResponses.success;
        res.writeHead(responseMode === 'success' || responseMode === 'malformed' ? 200 : 500, { 
          'Content-Type': 'application/json' 
        });
        res.end(JSON.stringify(response));
      }, 100); // 100ms delay
    });
    return;
  }
  
  // Default: 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[Mock LLM Server] Running on http://localhost:${PORT}`);
  console.log(`[Mock LLM Server] Mode: ${responseMode}`);
  console.log('[Mock LLM Server] Endpoints:');
  console.log('  POST /mock - Claude API mock');
  console.log('  POST /control - Change response mode');
  console.log('  GET /status - Server status');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n[Mock Server] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

export { server, PORT };
