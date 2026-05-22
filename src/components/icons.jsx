// Icons (inline SVG, 1.5 stroke — matches lucide weight)
//
// `Icon` is the base SVG wrapper used by every named icon below.
// `I` is the named icon map — `I.Light`, `I.Speaker`, etc. Treat it as the
// project's icon registry: add new icons here, never inline SVG paths in
// components.

import React from 'react';

export const Icon = ({ d, size = 16, fill = "none", stroke = 1.5, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const I = {
  Home:    (p) => <Icon {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></Icon>,
  Light:   (p) => <Icon {...p}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.6 1 2.5v1h6v-1c0-.9.3-1.8 1-2.5A6 6 0 0 0 12 3Z"/></Icon>,
  Plug:    (p) => <Icon {...p}><path d="M9 2v6"/><path d="M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z"/><path d="M12 16v6"/></Icon>,
  Speaker: (p) => <Icon {...p}><rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="0.8" fill="currentColor"/></Icon>,
  Sun:     (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  Moon:    (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></Icon>,
  Film:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M11 4v16"/></Icon>,
  Utensils:(p) => <Icon {...p}><path d="M5 3v8a3 3 0 0 0 3 3v7M8 3v6M14 3c-1.5 2-2 4-2 6 0 1 .5 2 2 2v9"/></Icon>,
  PowerOff:(p) => <Icon {...p}><path d="M18.4 6.6a9 9 0 1 1-12.7 0"/><path d="M12 2v10"/></Icon>,
  Cloud:   (p) => <Icon {...p}><path d="M17.5 19a4.5 4.5 0 1 0-.9-8.9 6 6 0 0 0-11.6 2A4 4 0 0 0 6 19h11.5Z"/></Icon>,
  News:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></Icon>,
  Zap:     (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></Icon>,
  Music:   (p) => <Icon {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></Icon>,
  Settings:(p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1.1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1.1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1.1-1.6V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.2 4.7a1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.6 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Icon>,
  Play:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M6 4v16l14-8L6 4Z"/></Icon>,
  Pause:   (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></Icon>,
  Skip:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M5 4l11 8L5 20V4ZM17 4h2v16h-2V4Z"/></Icon>,
  Back:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M19 4 8 12l11 8V4ZM5 4h2v16H5V4Z"/></Icon>,
  Vol:     (p) => <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a4 4 0 0 1 0 7"/></Icon>,
  VolMute: (p) => <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M22 9l-6 6M16 9l6 6"/></Icon>,
  TV:      (p) => <Icon {...p}><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></Icon>,
  Coffee:  (p) => <Icon {...p}><path d="M4 8h13a4 4 0 0 1 0 8h-1"/><path d="M4 8v8a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8H4Z"/><path d="M7 3v2M11 3v2M15 3v2"/></Icon>,
  Router:  (p) => <Icon {...p}><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 17h.01M10 17h.01M7 13V9a5 5 0 0 1 10 0v4M12 9v4"/></Icon>,
  Fan:     (p) => <Icon {...p}><circle cx="12" cy="12" r="2"/><path d="M12 10c-2-4-1-7 1-7s3 3 1 7M12 14c2 4 1 7-1 7s-3-3-1-7M10 12c-4-2-7-1-7 1s3 3 7 1M14 12c4 2 7 1 7-1s-3-3-7-1"/></Icon>,
  Lamp:    (p) => <Icon {...p}><path d="M9 2h6l3 7H6l3-7Z"/><path d="M12 9v9M9 18h6"/></Icon>,
  Bulb:    (p) => <Icon {...p}><circle cx="12" cy="9" r="5"/><path d="M9 18h6M10 21h4"/></Icon>,
  Search:      (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Disc:        (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></Icon>,
  ChevronDown:  (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  X:           (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>,
  Wifi:        (p) => <Icon {...p}><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></Icon>,
  Bell:        (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></Icon>,
  Shield:      (p) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Check:       (p) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>,
  Radio:       (p) => <Icon {...p}><path d="M2 7h20M10 7V4M14 7V4M6 13h12M6 17h12"/><rect x="2" y="7" width="20" height="14" rx="2"/></Icon>,
  Thermometer: (p) => <Icon {...p}><path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z"/></Icon>,
  Lock:        (p) => <Icon {...p}><rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></Icon>,
  Unlock:      (p) => <Icon {...p}><rect x="5" y="11" width="14" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.8"/></Icon>,
  Minus:       (p) => <Icon {...p}><path d="M5 12h14"/></Icon>,
  Plus:        (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Blinds:      (p) => <Icon {...p}><path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3"/></Icon>,
  ArrowUp:     (p) => <Icon {...p}><path d="m18 15-6-6-6 6"/></Icon>,
  ArrowDown:   (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  Heart:       (p) => <Icon {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1 7.8 7.8 7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/></Icon>,
  Clock:       (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></Icon>,
};
