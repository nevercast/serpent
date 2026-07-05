// Minimal DOM/canvas/rAF stubs so the browser entry (src/main.js) can be booted
// and driven under Node — enough to catch import/wiring errors and exercise the
// input + loop paths without a real browser. Install BEFORE importing main.js.
const noop = () => {};

function ctxStub() {
  return new Proxy({}, {
    get(_t, p) {
      if (typeof p === 'symbol') return undefined;
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'measureText') return () => ({ width: 1 });
      return noop;
    },
    set() { return true; }
  });
}

function makeEl(tag) {
  const listeners = {};
  const classes = new Set();
  let text = '';
  return {
    tag, width: 0, height: 0, listeners,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener: noop,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        }
        else if (force) classes.add(c);
        else classes.delete(c);
        return classes.has(c);
      },
      contains: c => classes.has(c),
    },
    contains: () => false,
    closest: () => null,
    getContext: () => ctxStub(),
    setPointerCapture: noop, releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 1122, top: 558, width: 140, height: 140 }),
    style: {},
    set textContent(v) { text = String(v); }, get textContent() { return text; },
  };
}

export function installStubs() {
  const els = {};
  const winListeners = {};
  const docListeners = {};
  let rafQ = [];
  let tNow = 1000;

  const doc = {
    getElementById: id => els[id] || (els[id] = makeEl(id)),
    createElement: t => makeEl(t),
    addEventListener(n, f) { (docListeners[n] = docListeners[n] || []).push(f); },
    hidden: false,
    body: { appendChild: noop },
  };
  const storage = (() => {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k),
    };
  })();
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(n, f) { (winListeners[n] = winListeners[n] || []).push(f); },
    localStorage: storage,
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;
  globalThis.performance = { now: () => tNow };
  globalThis.requestAnimationFrame = f => { rafQ.push(f); return 1; };

  const fire = (map, name, ev) => (map[name] || []).forEach(f => f(ev));

  return {
    els, win, doc,
    plain: () => ({ closest: () => null }),
    fireWin: (n, ev) => fire(winListeners, n, ev),
    fireDoc: (n, ev) => fire(docListeners, n, ev),
    fireEl: (id, n, ev) => fire((els[id] || doc.getElementById(id)).listeners, n, ev),
    advance(n, ms) {
      for (let i = 0; i < n; i++) {
        tNow += ms;
        const q = rafQ; rafQ = [];
        for (const f of q) f(tNow);
      }
    },
  };
}
