import React from 'react';
import SelectionMenu from './components/SelectionMenu';
import AIPanel from './components/AIPanel';

/**
 * Root application component.
 * Integrates the selection menu and retains existing layout.
 */
const App: React.FC = () => {
  return (
    <div className="app-container">
      {/* Existing app structure */}
      <SelectionMenu />
      {/* Optionally render the AI panel elsewhere in the UI */}
      {/* <AIPanel /> */}
    </div>
  );
};

export default App;
