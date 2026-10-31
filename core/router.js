// Tiny hash router: "#/learn/3?x=1" -> path "/learn/3", query {x: "1"}.
// Hash routing works on GitHub Pages sub-paths with no server config.

const routes = [];
let notFoundHandler = null;
let onNavigate = null;

/** Split a location hash into { path, query }. Pure (testable). */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = '/' + pathPart.split('/').filter(Boolean).join('/');
  const query = {};
  for (const pair of queryPart.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try { query[decodeURIComponent(k)] = decodeURIComponent(v); } catch { /* ignore malformed */ }
  }
  return { path: path === '/' ? '/home' : path, query };
}

/** Match "/learn/:id" against "/learn/3" -> { id: "3" } or null. Pure. */
export function matchRoute(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      try { params[p[i].slice(1)] = decodeURIComponent(s[i]); } catch { return null; }
    } else if (p[i] !== s[i]) {
      return null;
    }
  }
  return params;
}

/** Register a route. handler({ params, query, path }) is called on navigation. */
export function addRoute(pattern, handler) {
  routes.push({ pattern, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) location.replace(target);
  else location.hash = target;
}

/** Resolve the current hash to { handler, ctx } (also used for re-rendering). */
export function resolve() {
  const { path, query } = parseHash(location.hash);
  for (const route of routes) {
    const params = matchRoute(route.pattern, path);
    if (params) return { handler: route.handler, ctx: { params, query, path } };
  }
  return { handler: notFoundHandler, ctx: { params: {}, query, path } };
}

/** Call fn(route) on every navigation and once at start. */
export function start(fn) {
  onNavigate = fn;
  window.addEventListener('hashchange', () => onNavigate(resolve(), { fromHashChange: true }));
  onNavigate(resolve(), { fromHashChange: false });
}

/** Re-run the current route (e.g. after a language change). */
export function refresh() {
  if (onNavigate) onNavigate(resolve(), { fromHashChange: false, refresh: true });
}
