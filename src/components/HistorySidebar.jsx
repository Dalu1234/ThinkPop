import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_HISTORY = [
  { id: 1, group: 'Today', title: 'Pythagorean Theorem', icon: '📐' },
  { id: 2, group: 'Today', title: 'Photosynthesis', icon: '🌿' },
  { id: 3, group: 'Yesterday', title: 'Solar System', icon: '🪐' },
  { id: 4, group: 'Yesterday', title: 'DNA Structure', icon: '🧬' },
  { id: 5, group: 'Previous 7 Days', title: 'Gravity & Motion', icon: '🍎' },
  { id: 6, group: 'Previous 7 Days', title: 'The Water Cycle', icon: '💧' },
  { id: 7, group: 'Previous 30 Days', title: 'Volcanic Activity', icon: '🌋' },
];

export default function HistorySidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(prev => !prev);

  // Group the items
  const grouped = MOCK_HISTORY.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <>
      <button 
        className="history-toggle-btn" 
        onClick={toggleSidebar}
        title={isOpen ? "Close History" : "Open History"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="history-sidebar"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="history-header">
              <h2>Conversations</h2>
            </div>
            
            <div className="history-content">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="history-group">
                  <h3 className="history-group-title">{group}</h3>
                  <ul className="history-list">
                    {items.map(item => (
                      <li key={item.id} className="history-item">
                        <span className="history-title">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
