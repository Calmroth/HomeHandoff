// Bottom nav — five daily-control destinations on mobile (≤720px).
// Weather and News are sidebar-only; they're informational, not control pages.

import React from 'react';
import { I } from './icons.jsx';

const BOTTOM_NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: I.Home },
  { id: 'rooms',    label: 'Rooms',    Icon: I.Light },
  { id: 'music',    label: 'Music',    Icon: I.Music },
  { id: 'energy',   label: 'Energy',   Icon: I.Zap },
  { id: 'settings', label: 'Settings', Icon: I.Settings },
];

export function BottomNav({ route, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {BOTTOM_NAV_ITEMS.map(item => {
        const Ic = item.Icon;
        const active = route === item.id;
        return (
          <button
            key={item.id}
            className="bottom-nav-item"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
          >
            <Ic size={22} strokeWidth={active ? 2 : 1.5} />
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
