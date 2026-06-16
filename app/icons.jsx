/* global React */

/* ============================================================
   Icons — single source. Stroke-based, 16px default.
   Hand-tuned 2px stroke to feel native to Windows/Fluent icons.
   ============================================================ */
const Icon = ({ name, size = 16, className = "", strokeWidth = 1.6 }) => {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth, strokeLinecap: "round", strokeLinejoin: "round",
    className: "icon icon-" + name + (className ? " " + className : "")
  };
  switch (name) {
    case "home":         return <svg {...props}><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>;
    case "assignments":  return <svg {...props}><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "courses":      return <svg {...props}><path d="M3 6l9-3 9 3-9 3-9-3z" /><path d="M7 9v5c0 1.5 2.5 3 5 3s5-1.5 5-3V9" /></svg>;
    case "calendar":     return <svg {...props}><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
    case "notes":        return <svg {...props}><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4" /><path d="M8 13h8M8 17h5" /></svg>;
    case "grades":       return <svg {...props}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>;
    case "totals":       return <svg {...props}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /><path d="M3 12h18" strokeDasharray="2 2" /></svg>;
    case "library":      return <svg {...props}><path d="M5 4v16M9 4v16M13 4l5 16" /></svg>;
    case "archive":      return <svg {...props}><rect x="3" y="5" width="18" height="4" rx="1" /><path d="M5 9v10h14V9" /><path d="M10 13h4" /></svg>;
    case "search":       return <svg {...props}><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></svg>;
    case "bell":         return <svg {...props}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>;
    case "settings":     return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "help":         return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></svg>;
    case "plus":         return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus":        return <svg {...props}><path d="M5 12h14" /></svg>;
    case "filter":       return <svg {...props}><path d="M4 5h16l-6 8v5l-4 1v-6L4 5z" /></svg>;
    case "sort":         return <svg {...props}><path d="M7 4v14M7 4l-3 3M7 4l3 3" /><path d="M17 20V6M17 20l-3-3M17 20l3-3" /></svg>;
    case "more":         return <svg {...props}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>;
    case "chevron-down": return <svg {...props}><path d="m6 9 6 6 6-6" /></svg>;
    case "chevron-up":   return <svg {...props}><path d="m6 15 6-6 6 6" /></svg>;
    case "chevron-left": return <svg {...props}><path d="m15 6-6 6 6 6" /></svg>;
    case "chevron-right":return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
    case "close":        return <svg {...props}><path d="M6 6l12 12M18 6l-6 6-6 6" /></svg>;
    case "check":        return <svg {...props}><path d="m5 12 4 4 10-10" /></svg>;
    case "dash":         return <svg {...props}><path d="M6 12h12" /></svg>;
    case "menu":         return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case "layout-left":  return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16" /></svg>;
    case "layout-right": return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M15 4v16" /></svg>;
    case "flag":         return <svg {...props}><path d="M5 21V4h10l-1 3 1 3H5" /></svg>;
    case "paperclip":    return <svg {...props}><path d="M21 11.5 12 20a5 5 0 0 1-7-7L13.5 4.5a3.5 3.5 0 0 1 5 5L10 18a2 2 0 0 1-3-3l8-8" /></svg>;
    case "clock":        return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "user":         return <svg {...props}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" /></svg>;
    case "edit":         return <svg {...props}><path d="M16 4l4 4-11 11H5v-4z" /><path d="m14 6 4 4" /></svg>;
    case "trash":        return <svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></svg>;
    case "download":     return <svg {...props}><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></svg>;
    case "export":       return <svg {...props}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></svg>;
    case "link":         return <svg {...props}><path d="M10 14a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-1.5 1.5" /><path d="M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 0 1-6-6L6.5 11.5" /></svg>;
    case "maximize":     return <svg {...props}><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></svg>;
    case "minimize":     return <svg {...props}><path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" /></svg>;
    case "side-collapse":return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16" /><path d="m14 9 3 3-3 3" /></svg>;
    case "side-expand":  return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16" /><path d="m17 9-3 3 3 3" /></svg>;
    case "command":      return <svg {...props}><path d="M7 8a2 2 0 1 1 2-2v12a2 2 0 1 1-2-2h10a2 2 0 1 1-2 2V6a2 2 0 1 1 2 2H7z" /></svg>;
    case "circle-check": return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
    case "circle-warn":  return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16" r=".5" fill="currentColor" /></svg>;
    case "moon":         return <svg {...props}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>;
    case "sun":          return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>;
    case "refresh":      return <svg {...props}><path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6" /><path d="M20 12a8 8 0 0 1-14 5l-2 2v-6h6" /></svg>;
    case "window-min":   return <svg {...props}><path d="M5 18h14" /></svg>;
    case "window-max":   return <svg {...props}><rect x="5" y="5" width="14" height="14" /></svg>;
    case "window-close": return <svg {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    default: return null;
  }
};

window.Icon = Icon;
