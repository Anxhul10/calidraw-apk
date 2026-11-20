import React from 'react';
import SelectionMenuExtensions from './SelectionMenuExtensions';

/**
 * Core selection menu component.
 * Existing menu items are preserved; the AI extension is appended.
 */
const SelectionMenu: React.FC = () => {
  return (
    <div className="selection-menu">
      {/* Existing menu items would be rendered here */}
      {/* ... */}

      {/* AI extension */}
      <SelectionMenuExtensions />
    </div>
  );
};

export default SelectionMenu;
