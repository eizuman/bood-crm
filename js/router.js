// Bood CRM — Hash Router
const routes = {};
let currentRoute = null;
let onRouteChange = null;

export function register(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return currentRoute;
}

export function onNavigate(fn) {
  onRouteChange = fn;
}

export function start() {
  function resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const parts = hash.split('/').filter(Boolean);

    // Try exact match first, then prefix match
    let handler = routes[hash] || routes['/' + parts[0]];

    currentRoute = hash;
    onRouteChange && onRouteChange(hash);

    if (handler) {
      handler(parts);
    } else {
      // 404 — redirect to dashboard
      navigate('/dashboard');
    }
  }

  window.addEventListener('hashchange', resolve);
  resolve();
}
