import React from 'react';
import './Sidebar.css';

const menuItems = [
  { icon: 'bgremover', label: 'BG Remover', page: 'bgremover' },
  { icon: 'qa', label: 'QA Analysis', page: 'qa' },
  { icon: 'orders', label: 'Mockup Preview', page: 'orders' },
  { icon: 'garments', label: 'Garment Manager', page: 'garments' },
  { icon: 'gangsheet', label: 'Gang Sheet', page: 'gangsheet' },
  { icon: 'contrast', label: 'Contrast Checker', page: 'contrast' },
  { icon: 'ailab', label: 'AI Artwork Lab (Beta)', page: 'ailab' },
];

function Sidebar({ currentPage, onPageChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#2563eb" />
          <path d="M7 8h10M7 12h10M7 16h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="logo-text">PrintShop</span>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <a
            key={item.label}
            href="#"
            className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              onPageChange(item.page);
            }}
          >
            <MenuIcon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function MenuIcon({ name }) {
  const icons = {
    bgremover: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 01-.9 1.45H3.62a1 1 0 01-.9-1.45L4 16" />
        <path d="M9 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    dashboard: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    orders: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
      </svg>
    ),
    quotes: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    ),
    products: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    designs: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
    templates: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
    customers: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    reports: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    contrast: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 010 20V2z" fill="currentColor" />
      </svg>
    ),
    garments: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6.5 2L2 6.5l3.5 2L4 20h16l-1.5-11.5 3.5-2L18.5 2h-4L12 4l-2.5-2h-3z" strokeLinejoin="round" />
      </svg>
    ),
    gangsheet: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <rect x="4" y="4" width="7" height="5" rx="1" />
        <rect x="13" y="4" width="7" height="5" rx="1" />
        <rect x="4" y="11" width="5" height="5" rx="1" />
        <rect x="11" y="11" width="9" height="5" rx="1" />
        <rect x="4" y="18" width="16" height="2" rx="1" />
      </svg>
    ),
    qa: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <path d="M8 11l2 2 4-4" />
      </svg>
    ),
    ailab: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    settings: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export default Sidebar;
