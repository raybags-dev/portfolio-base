import type { Section } from "./types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  /** true for in-page section anchors (vs. a real route like /contact). */
  isAnchor: boolean;
}

// Single source of truth for the navbar. Only enabled, in-nav sections appear;
// anchors are absolute ("/#key") so they work from any route (fixes
// /contact#about) and never point at a section that doesn't exist.
const ROUTE_SECTIONS: Record<string, string> = {
  contact: "/contact",
  blog: "/blog",
  "chat-demo": "/chat-demo",
};

export function buildNavItems(sections: Section[]): NavItem[] {
  return sections
    .filter((s) => s.enabled && s.in_nav && s.key !== "hero")
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const route = ROUTE_SECTIONS[s.key];
      return route
        ? { key: s.key, label: s.label, href: route, isAnchor: false }
        : { key: s.key, label: s.label, href: `/#${s.key}`, isAnchor: true };
    });
}
