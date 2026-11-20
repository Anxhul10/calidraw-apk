import React, { useState } from 'react';

type AIPanelProps = {
  context?: string;
};

const AIPanel: React.FC<AIPanelProps> = ({ context = 'AI Assistant' }) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');

  const handleSend = () => {
    // Placeholder: echo the input; replace with actual AI service integration
    setResponse(`You asked: ${input}`);
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '4px' }}>
      <h3>{context}</h3>
      <textarea
        rows={4}
        style={{ width: '100%' }}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Ask something..."
      />
      <br />
      <button onClick={handleSend} style={{ marginTop: '0.5rem' }}>
        Send
      </button>
      {response && (
        <div style={{ marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
          <strong>Response:</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

export default AIPanel;
