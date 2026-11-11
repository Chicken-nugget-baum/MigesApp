// A* pathfinding on a tile grid. cost[i] === 0 means blocked.
(function (NB) {
  function Heap() { this.f = []; this.v = []; }
  Heap.prototype.push = function (f, v) {
    const F = this.f, V = this.v;
    let i = F.length; F.push(f); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      [F[p], F[i]] = [F[i], F[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p;
    }
  };
  Heap.prototype.pop = function () {
    const F = this.f, V = this.v;
    const top = V[0];
    const lf = F.pop(), lv = V.pop();
    if (F.length) {
      F[0] = lf; V[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < F.length && F[l] < F[m]) m = l;
        if (r < F.length && F[r] < F[m]) m = r;
        if (m === i) break;
        [F[m], F[i]] = [F[i], F[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  };
  Object.defineProperty(Heap.prototype, 'size', { get() { return this.f.length; } });

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  NB.findPath = function (cost, w, h, sx, sy, tx, ty, maxExpand) {
    maxExpand = maxExpand || 60000;
    if (sx === tx && sy === ty) return [];
    const t = ty * w + tx, s = sy * w + sx;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || !cost[t]) return null;
    const N = w * h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new Heap();
    g[s] = 0;
    heap.push(Math.abs(sx - tx) + Math.abs(sy - ty), s);
    let expanded = 0, found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === t) { found = true; break; }
      if (++expanded > maxExpand) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        const c = cost[ni];
        if (!c || closed[ni]) continue;
        const ng = g[cur] + c;
        if (ng < g[ni]) {
          g[ni] = ng; came[ni] = cur;
          heap.push(ng + Math.abs(nx - tx) + Math.abs(ny - ty), ni);
        }
      }
    }
    if (!found) return null;
    const path = [];
    for (let c = t; c !== s; c = came[c]) path.push({ x: c % w, y: (c / w) | 0 });
    return path.reverse();
  };
})(window.NB);
