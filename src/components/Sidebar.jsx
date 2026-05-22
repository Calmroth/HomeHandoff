// Sidebar — visual continuity with the original Sidebar.tsx mock.
// Active row reflects the hash route; bottom of the rail is the account block,
// which routes into Settings for sign-in / management.

import React from 'react';
import { I } from './icons.jsx';

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: I.Home },
  { id: 'rooms',    label: 'Rooms',    Icon: I.Light },
  { id: 'music',    label: 'Music',    Icon: I.Music },
  { id: 'energy',   label: 'Energy',   Icon: I.Zap },
  { id: 'weather',  label: 'Weather',  Icon: I.Cloud },
  { id: 'news',     label: 'News',     Icon: I.News },
];

export function Sidebar({ route, onNavigate, google }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><I.Home size={15} /></div>
        <div className="brand-name">Home Domain</div>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map(item => {
          const Ic = item.Icon;
          return (
            <button
              key={item.id}
              className={'nav-row' + (route === item.id ? ' row-active' : '')}
              onClick={() => onNavigate(item.id)}
              aria-current={route === item.id ? 'page' : undefined}
            >
              <span className="dot" />
              <Ic className="icon" /> {item.label}
            </button>
          );
        })}
        <button
          className={'nav-row' + (route === 'settings' ? ' row-active' : '')}
          style={{ marginTop: 'auto' }}
          onClick={() => onNavigate('settings')}
          aria-current={route === 'settings' ? 'page' : undefined}
        >
          <span className="dot" /><I.Settings className="icon" /> Settings
        </button>
      </nav>

      <button
        type="button"
        className="account"
        style={{ marginTop: 16, background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer', borderTop: '1px solid var(--border)', paddingTop: 16 }}
        onClick={() => onNavigate('settings')}
        title={google?.user ? 'Manage account in Settings' : 'Sign in via Settings'}
      >
        {google?.user ? (
          <>
            {google.user.picture
              ? <img className="avatar" src={google.user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 32, height: 32, objectFit: 'cover', background: 'none' }} />
              : <div className="avatar">{(google.user.given_name || google.user.name || '?').slice(0, 1).toUpperCase()}</div>}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="account-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{google.user.name}</div>
              <div className="account-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{google.user.email}</div>
            </div>
          </>
        ) : (
          <>
            <div className="avatar" style={{ background: 'color-mix(in oklch, var(--clay-50) 8%, transparent)', color: 'var(--muted-foreground)' }}>
              <I.Settings size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="account-name">Sign in</div>
              <div className="account-email">Set up your account in Settings</div>
            </div>
          </>
        )}
      </button>
    </aside>
  );
}
