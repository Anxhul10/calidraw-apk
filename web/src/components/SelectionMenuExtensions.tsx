import React from 'react';

/**
 * Extension component for the selection menu.
 * Adds an "Ask AI" button that communicates with the native bridge.
 */
const SelectionMenuExtensions: React.FC = () => {
  const handleAskAI = () => {
    // Android WebView bridge (Java side) example
    const androidBridge = (window as any).Android;
    if (androidBridge && typeof androidBridge.askAI === 'function') {
      androidBridge.askAI();
      return;
    }
    // React Native WebView bridge example
    const rnBridge = (window as any).ReactNativeWebView;
    if (rnBridge && typeof rnBridge.postMessage === 'function') {
      rnBridge.postMessage(JSON.stringify({ type: 'ASK_AI' }));
      return;
    }
    console.warn('Native bridge for Ask AI is not available');
  };

  return (
    <button onClick={handleAskAI} style={{ marginTop: '8px' }}>
      Ask AI
    </button>
  );
};

export default SelectionMenuExtensions;
