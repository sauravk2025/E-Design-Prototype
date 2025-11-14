import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  computed,
  effect,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';

type Port = 'top' | 'bottom';

interface PartType {
  type: string;
  label: string;
  w: number;
  h: number;
}

interface PlacedPart {
  id: string;
  type: string;
  label: string;
  w: number;
  h: number;
  railIndex: number; // 0..N-1
  x: number;         // left within rail (0..RAIL_WIDTH-w)
  y: number;         // always -h/2 so the rail passes through center
}

interface ConnectorRef {
  partId: string;
  port: Port;
}

interface Connection {
  id: string;
  from: ConnectorRef;
  to: ConnectorRef;
  color: string;

  // NEW
  manual: boolean;        // Has the user overridden auto routing?
  manualPoints?: Pt[];    // The stored polyline in panel coordinates
}

/** Geometry helpers for routing */
interface Pt { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }

@Component({
  selector: 'app-panel-designer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './panel-designer.html',
  styleUrls: ['./panel-designer.scss'],
})
export class PanelDesignerComponent implements AfterViewInit {
  // Layout constants
  readonly MAX_RAILS = 5;
  readonly RAIL_WIDTH = 640;          // rail width
  readonly RAIL_SPACING = 200;        // margin-top before every rail
  readonly LAST_BOTTOM_MARGIN = 250;  // extra bottom space after last rail
  readonly CONNECTOR_SIZE = 15;
  readonly GRID = 5;

  // Router tuning
  readonly ROUTE_STEP = 10;          // grid resolution (px)
  readonly OBSTACLE_CLEAR = 4;       // inflate obstacles (px)
  readonly STUB_LEN = 10;            // initial vertical stub length from connector (px)
  readonly RAIL_BLOCK_THICK = 12; // px thickness used to “block” rails for routing
  readonly FANOUT_GAP = 10; // px; keep a multiple of ROUTE_STEP for clean grid
  private readonly SOURCE_GAP = 12;
  private pathCache = new Map<string, Pt[]>();   // connId -> routed points (in panel coords)
  private pathEpoch = 0;
  
  readonly TURN_PENALTY = 4;   
  /** thickness (px) for wire “keep-out” rectangles so different sources never overlap */
private WIRE_BLOCK_THICK = 8;
// --- NEW: wire overlap avoidance ---
readonly WIRE_CLEAR = 6;     // px extra clearance around existing wires
readonly WIRE_STROKE = 3;    // matches SVG stroke-width
  // State
  railsCount = signal<number>(1);
  locked = signal<boolean>(false);

  toolbox: PartType[] = [
    { type: 'SP',       label: 'SP',       w: 80,  h: 80  },
    { type: 'MCB_1P',   label: 'MCB 1P',   w: 90,  h: 90  },
    { type: 'MCB_2P',   label: 'MCB 2P',   w: 100, h: 100 },
    { type: 'MCB_3P',   label: 'MCB_3P',   w: 110, h: 110 },
    { type: 'CN-10/30',   label: 'CN-10/30',   w: 100, h: 90  },
    { type: 'CN-10A',   label: 'CN-10A',   w: 100, h: 90  },
    { type: 'C3N-16A',  label: 'C3N-16A',  w: 130, h: 120 },
    { type: 'C3N-13A',  label: 'C3N-13A',  w: 130, h: 120 },
    { type: 'RCD',      label: 'RCD',      w: 130, h: 120 },
  ];

  parts = signal<PlacedPart[]>([]);
  connections = signal<Connection[]>([]);
  pendingFrom = signal<ConnectorRef | null>(null);

  // Visual-only drag state (kept from your version)
  isDragging = signal<boolean>(false);
  hoverRailIndex = signal<number | null>(null);
  preview = signal<{ x: number; w: number; h: number; railIndex: number } | null>(null);
  draggingPartId = signal<string | null>(null);

  editingConnId = signal<string | null>(null);
dragHandle = signal<{connId: string; index: number} | null>(null);


  // Color cycle for multiple lines
  private colorCycle = [
    '#d32f2f','#1976d2','#388e3c','#f57c00','#7b1fa2',
    '#00796b','#455a64','#c2185b','#5d4037','#512da8'
  ];
  private colorIndex = 0;
/** Key for “source port” identity */
private sourceKey(c: Connection) {
  return `${c.from.partId}:${c.from.port}`;
}

/** Convert an orthogonal polyline into blocking rects (corridor) */
private wireRectsFromPath(pts: Pt[], inflate = this.WIRE_CLEAR + this.WIRE_STROKE/2): Rect[] {
  const rects: Rect[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a.x === b.x) {
      // vertical segment
      const x = Math.min(a.x, b.x) - inflate;
      const y = Math.min(a.y, b.y);
      const h = Math.max(a.y, b.y) - y;
      rects.push({ x, y, w: inflate * 2, h: Math.max(1, h) });
    } else if (a.y === b.y) {
      // horizontal segment
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y) - inflate;
      const w = Math.max(a.x, b.x) - x;
      rects.push({ x, y, w: Math.max(1, w), h: inflate * 2 });
    }
  }
  return rects;
}


private invalidatePaths() { this.pathCache.clear(); }


private resetPathCacheEffect = effect(() => {
  // touching these signals re-triggers when they change
  void this.parts();
  void this.connections();
  this.pathCache.clear();
});
  private snap(n: number, step = this.ROUTE_STEP) {
  return Math.round(n / step) * step;
}

/** Center X of a placed part in panel coords */
private partCenterX(p: PlacedPart): number {
  const railLeft = this.getRailLeft();
  return railLeft + p.x + p.w / 2;
}
/** Is this part the leftmost on its rail (within GRID tolerance)? */
private isLeftmostOnRail(p: PlacedPart): boolean {
  const onRail = this.parts().filter(x => x.railIndex === p.railIndex);
  if (!onRail.length) return false;
  const minX = Math.min(...onRail.map(x => x.x));
  return Math.abs(p.x - minX) <= this.GRID;
}

private sourceLaneOffset(src: ConnectorRef): number {
  const uniq = Array.from(new Set(this.connections().map(c => c.from.partId))).sort();
  const idx = uniq.indexOf(src.partId);
  if (idx < 0 || uniq.length <= 1) return 0;
  const center = (uniq.length - 1) / 2;
  const raw = (idx - center) * this.SOURCE_GAP;
  return this.snap(raw);
}


/** Is this part the rightmost on its rail (within GRID tolerance)? */
private isRightmostOnRail(p: PlacedPart): boolean {
  const onRail = this.parts().filter(x => x.railIndex === p.railIndex);
  if (!onRail.length) return false;
  const maxRight = Math.max(...onRail.map(x => x.x + x.w));
  return Math.abs((p.x + p.w) - maxRight) <= this.GRID;
}


/** Deterministic ordering for those connections so lanes don't shuffle */
private sortConnsForPort(conns: Connection[], ref: ConnectorRef): Connection[] {
  const other = (c: Connection) =>
    (c.from.partId === ref.partId && c.from.port === ref.port) ? c.to : c.from;

  return conns.slice().sort((a, b) => {
    const oa = other(a), ob = other(b);
    // sort by other partId, then by other port ('bottom' after 'top')
    if (oa.partId !== ob.partId) return oa.partId < ob.partId ? -1 : 1;
    if (oa.port !== ob.port) return oa.port === 'top' ? -1 : 1;
    // stable tiebreaker by connection id
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
}

/** 0-based index and total count for a connection among its siblings on the same port */
private portSlot(ref: ConnectorRef, connId: string): { index: number; total: number } {
  const conns = this.sortConnsForPort(this.connectionsAtPort(ref), ref);
  const index = Math.max(0, conns.findIndex(c => c.id === connId));
  return { index, total: conns.length };
}


/** Returns all connections that touch a given port (both directions) */
private connectionsAtPort(ref: ConnectorRef): Connection[] {
  const list = this.connections();
  return list.filter(c =>
    (c.from.partId === ref.partId && c.from.port === ref.port) ||
    (c.to.partId   === ref.partId && c.to.port   === ref.port)
  );
}



/** Are two parts vertically aligned (centers within one grid step)? */
private verticallyAligned(a: PlacedPart, b: PlacedPart): boolean {
  return Math.abs(this.partCenterX(a) - this.partCenterX(b)) <= this.GRID;
}


  // Rails Y positions: (i+1) * 200
  railsTop = computed(() =>
    Array.from({ length: this.railsCount() }, (_, i) => (i + 1) * this.RAIL_SPACING)
  );

  // Panel height: last rail plus bottom margin
  panelHeight = computed(() => {
    const n = this.railsCount();
    if (n === 0) return this.LAST_BOTTOM_MARGIN;
    return this.railsTop()[n - 1] + this.LAST_BOTTOM_MARGIN;
  });

  /** Only render connections that still have both endpoints */
  visibleConnections = computed(() => {
    const keep = new Set(this.parts().map(p => p.id));
    return this.connections().filter(
      c => keep.has(c.from.partId) && keep.has(c.to.partId)
    );
  });
  orderedConnections = computed(() => {
  const list = this.visibleConnections().slice();
  list.sort((a, b) => {
    if (a.from.partId !== b.from.partId) {
      return a.from.partId < b.from.partId ? -1 : 1;
    }
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
  return list;
});
  @ViewChild('panelRef', { static: true }) panelRef!: ElementRef<HTMLDivElement>;

  ngAfterViewInit(): void {
    // When railsCount changes, drop parts on removed rails and prune wires/pending.
    effect(() => {
      const maxRails = this.railsCount();
      const currentParts = this.parts();

      const keptParts = currentParts.filter(p => p.railIndex < maxRails);
      if (keptParts.length !== currentParts.length) {
        this.parts.set(keptParts);

        const keepIds = new Set(keptParts.map(p => p.id));
        const prunedConns = this.connections().filter(
          c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId)
        );
        if (prunedConns.length !== this.connections().length) {
          this.connections.set(prunedConns);
        }

        const pending = this.pendingFrom();
        if (pending && !keepIds.has(pending.partId)) {
          this.pendingFrom.set(null);
        }

        this.prunePortColors(keepIds);
      }

      this.invalidatePaths();
    });
    effect(() => {
    const conns = this.connections();         // signal dependency
    this.pathCache.clear();
    this.pathEpoch++;                          // bump so we can force rebuild order
  });
    // Extra safety: if parts change by any cause, ensure wires valid
    effect(() => {
      const keepIds = new Set(this.parts().map(p => p.id));
      const filtered = this.connections().filter(
        c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId)
      );
      if (filtered.length !== this.connections().length) {
        this.connections.set(filtered);
      }
    });
effect(() => {
  const snapshot = JSON.stringify({
    parts: this.parts(),
    conns: this.connections()
  });
  // touching this effect guarantees it runs when either changes
  // (we only need the side-effect)
  this.invalidatePaths();
});

    
  }

  // Rails count (1..5), disabled when locked (selector itself also disabled in HTML)
  setRailsCount(count: number) {
    if (this.locked()) return;
    const n = Math.max(1, Math.min(this.MAX_RAILS, count));
    if (n === this.railsCount()) return;

    this.railsCount.set(n);

    // Atomic pruning (parts + wires + pending)
    const keptParts = this.parts().filter(p => p.railIndex < n);
    
    if (keptParts.length !== this.parts().length) {
      this.parts.set(keptParts);
      const keepIds = new Set(keptParts.map(p => p.id));
      
      this.connections.set(
        this.connections().filter(
          c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId)
        )
      );
      
      this.prunePortColors(keepIds);

      const pending = this.pendingFrom();
      if (pending && !keepIds.has(pending.partId)) this.pendingFrom.set(null);
    }
    this.invalidatePaths();
  }

  private rectsFromPolyline(path: Pt[], thick = this.WIRE_BLOCK_THICK): Rect[] {
  if (path.length < 2) return [];
  const half = thick / 2;
  const rects: Rect[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (a.x === b.x) {
      // vertical segment
      const x = Math.min(a.x, b.x) - half;
      const y = Math.min(a.y, b.y);
      const h = Math.abs(b.y - a.y);
      rects.push({ x, y, w: thick, h: Math.max(1, h) });
    } else if (a.y === b.y) {
      // horizontal segment
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y) - half;
      const w = Math.abs(b.x - a.x);
      rects.push({ x, y, w: Math.max(1, w), h: thick });
    }
    // (no diagonals in our path)
  }
  return rects;
}

/** Get already-routed paths from *different* sources that come before this conn */
private foreignWireRectsFor(conn: Connection): Rect[] {
  const rects: Rect[] = [];
  // Only consider paths already cached (== routed earlier in orderedConnections())
  for (const [cid, path] of this.pathCache.entries()) {
    const other = this.connections().find(c => c.id === cid);
    if (!other) continue;
    if (other.from.partId === conn.from.partId) continue; // same source may overlap
    rects.push(...this.rectsFromPolyline(path));
  }
  return rects;
}


  private bufferSegRect(a: Pt, b: Pt, pad: number): Rect {
  if (a.x === b.x) {
    // vertical
    const x = Math.min(a.x, b.x) - pad;
    const y = Math.min(a.y, b.y);
    const h = Math.abs(b.y - a.y);
    return { x, y, w: pad * 2, h: Math.max(1, h) };
  } else {
    // horizontal
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y) - pad;
    const w = Math.abs(b.x - a.x);
    return { x, y, w: Math.max(1, w), h: pad * 2 };
  }
}
private wireObstaclesFromPath(path: Pt[], pad: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    // they *should* be orthogonal; if not, snap and skip diagonals
    if (p.x !== q.x && p.y !== q.y) continue;
    out.push(this.bufferSegRect(p, q, pad));
  }
  return out;
}

  // Center rails horizontally in the panel container
  private getRailLeft(): number {
    const el = this.panelRef?.nativeElement;
    if (!el) return 0;
    const width = el.clientWidth;
    return Math.max(0, Math.floor((width - this.RAIL_WIDTH) / 2));
  }

  // =============== Drag from toolbox into panel ==============================
  onStartDragToolbox(pt: PartType, ev: MouseEvent) {
    if (this.locked()) return;

    const panelRect = this.panelRef.nativeElement.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = `${pt.w}px`;
    ghost.style.height = `${pt.h}px`;
    ghost.innerHTML = `<span>${pt.label}</span>`;
    document.body.appendChild(ghost);

    this.isDragging.set(true);
    this.hoverRailIndex.set(null);
    this.preview.set(null);

    const onMove = (e: MouseEvent) => {
      ghost.style.left = `${e.pageX}px`;
      ghost.style.top = `${e.pageY}px`;

      const mx = e.clientX, my = e.clientY;
      const inside =
        mx >= panelRect.left && mx <= panelRect.right &&
        my >= panelRect.top && my <= panelRect.bottom;

      if (inside) {
        const relY = my - panelRect.top;
        let railIdx = 0, best = Infinity;
        this.railsTop().forEach((ry, i) => {
          const d = Math.abs(relY - ry);
          if (d < best) { best = d; railIdx = i; }
        });
        this.hoverRailIndex.set(railIdx);

        const railLeft = this.getRailLeft();
        const localXRaw = mx - panelRect.left - railLeft - pt.w / 2;
        const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - pt.w, localXRaw));
        const snappedX = Math.round(boundedX / this.GRID) * this.GRID;

        this.preview.set({ x: snappedX, w: pt.w, h: pt.h, railIndex: railIdx });
      } else {
        this.hoverRailIndex.set(null);
        this.preview.set(null);
      }
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const mx = e.clientX, my = e.clientY;
      const inside =
        mx >= panelRect.left && mx <= panelRect.right &&
        my >= panelRect.top && my <= panelRect.bottom;

      if (inside) {
        const pv = this.preview();
        if (pv) {
          this.placePart(pt, pv.railIndex, pv.x);
        } else {
          const relY = my - panelRect.top;
          let railIdx = 0, best = Infinity;
          this.railsTop().forEach((ry, i) => {
            const d = Math.abs(relY - ry);
            if (d < best) { best = d; railIdx = i; }
          });
          const railLeft = this.getRailLeft();
          const localX = mx - panelRect.left - railLeft - pt.w / 2;
          this.placePart(pt, railIdx, localX);
        }
      }

      ghost.remove();
      this.isDragging.set(false);
      this.hoverRailIndex.set(null);
      this.preview.set(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private placePart(pt: PartType, railIndex: number, x: number) {
    const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - pt.w, x));
    const snappedX = Math.round(boundedX / this.GRID) * this.GRID;

    const y = -pt.h / 2;

    if (this.collides({ x: snappedX, y, w: pt.w, h: pt.h }, railIndex, null)) return;

    const id = crypto.randomUUID();
    const part: PlacedPart = {
      id, type: pt.type, label: pt.label,
      w: pt.w, h: pt.h, railIndex,
      x: snappedX, y
    };
    this.parts.update(list => [...list, part]);
  }

  // =============== Drag inside panel (horizontal-only; can change rail) =====
  onPartMouseDown(e: MouseEvent, partId: string) {
    if (this.locked()) return;
    e.stopPropagation();

    const parts = this.parts();
    const idx = parts.findIndex(p => p.id === partId);
    if (idx < 0) return;

    const startPart = parts[idx];
    const startX = e.clientX;

    this.isDragging.set(true);
    this.draggingPartId.set(startPart.id);

    const panelRect = this.panelRef.nativeElement.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;

      // Pick nearest rail under the cursor
      const mouseRelY = ev.clientY - panelRect.top;
      let railIdx = 0, best = Infinity;
      this.railsTop().forEach((ry, i) => {
        const d = Math.abs(mouseRelY - ry);
        if (d < best) { best = d; railIdx = i; }
      });
      this.hoverRailIndex.set(railIdx);

      const candX = startPart.x + dx;
      const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - startPart.w, candX));
      const snappedX = Math.round(boundedX / this.GRID) * this.GRID;

      const temp = [...this.parts()];
      temp[idx] = { ...startPart, railIndex: railIdx, x: snappedX, y: -startPart.h / 2 };
      this.parts.set(temp);

      this.preview.set({ x: snappedX, w: startPart.w, h: startPart.h, railIndex: railIdx });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const now = this.parts()[idx];
      if (this.collides({ x: now.x, y: -now.h / 2, w: now.w, h: now.h }, now.railIndex, now.id)) {
        const temp = [...this.parts()];
        temp[idx] = startPart; // revert
        this.parts.set(temp);
      }

      this.isDragging.set(false);
      this.draggingPartId.set(null);
      this.hoverRailIndex.set(null);
      this.preview.set(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // =============== Finalize / unlock ========================================
  finalizeLayout() {
    if (this.locked()) return;
    const yes = window.confirm('Are you sure the design is final? You will not be able to move components.');
    if (yes) this.locked.set(true);
  }

  unfinalizeLayout() {
    const yes = window.confirm('Unlock layout for editing? Connections remain but movement is enabled.');
    if (yes) this.locked.set(false);
  }

  // =============== Connectors & connections =================================
  showConnectors() { return this.locked(); }

  /** Connector dot position INSIDE the component (centered horizontally on top/bottom) */
  connectorStyle(p: PlacedPart, port: Port) {
    const size = this.CONNECTOR_SIZE;
    const left = (p.w - size) / 2;
    const top  = port === 'top' ? 0 : (p.h - size);
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${size}px`,
      height: `${size}px`,
    };
  }

  onClickConnector(partId: string, port: Port) {
    const from = this.pendingFrom();
    const here: ConnectorRef = { partId, port };

    if (!from) {
      this.pendingFrom.set(here);
      return;
    }

    // No self-connection
    if (from.partId === here.partId) {
      this.pendingFrom.set(null);
      return;
    }

    //const color = this.nextColor();
    const color = this.getOrAssignColor(from.partId, from.port);
    const conn: Connection = {
  id: crypto.randomUUID(),
  from,
  to: here,
  color,
  manual: false
};

    this.connections.update(list => [...list, conn]);
    this.pendingFrom.set(null);
  }

  private nextColor() {
    const c = this.colorCycle[this.colorIndex % this.colorCycle.length];
    this.colorIndex++;
    return c;
  }

  // Only X-axis overlap matters because all boxes are centered vertically on the rail
  private collides(r: { x: number; y: number; w: number; h: number }, railIndex: number, ignoreId: string | null): boolean {
    const list = this.parts().filter(p => p.railIndex === railIndex && p.id !== ignoreId);
    return list.some(p => r.x < p.x + p.w && r.x + r.w > p.x);
  }

  railStyle(i: number) {
    return {
      left: `${this.getRailLeft()}px`,
      width: `${this.RAIL_WIDTH}px`,
      top: `${this.railsTop()[i]}px`,
      height: `0px`,
    };
  }

  panelStyle() {
    return { height: `${this.panelHeight()}px` };
  }

  onPanelClick() {
    if (this.pendingFrom()) this.pendingFrom.set(null);
  }

  // ======================= ORTHOGONAL ROUTER ================================

  /** Build absolute panel-space rect for a part (including rail offset + centering) */
  private partRectAbs(p: PlacedPart): Rect {
    const railLeft = this.getRailLeft();
    const railY = this.railsTop()[p.railIndex];
    return { x: railLeft + p.x, y: railY - p.h / 2, w: p.w, h: p.h };
  }

  /** Connector center in panel coords (inside edge center) */
  private connectorCenter(ref: ConnectorRef): Pt | null {
    const p = this.parts().find(q => q.id === ref.partId);
    if (!p) return null;
    const r = this.partRectAbs(p);
    const size = this.CONNECTOR_SIZE;
    if (ref.port === 'top') {
      return { x: r.x + r.w / 2, y: r.y + size / 2 };
    } else {
      return { x: r.x + r.w / 2, y: r.y + r.h - size / 2 };
    }
  }


onSelectConnection(conn: Connection, ev: MouseEvent) {
  ev.stopPropagation();

  // If not manual, lock in the current auto-routed path as template
  if (!conn.manual) {
    const auto = this.pathCache.get(conn.id);
    if (auto && auto.length >= 2) {
      conn.manual = true;
      conn.manualPoints = auto.map(p => ({ x: p.x, y: p.y }));
      this.connections.set([...this.connections()]); // trigger signal update
    }
  }

  this.editingConnId.set(conn.id);
}


onHandleDown(connId: string, index: number, ev: MouseEvent) {
  ev.stopPropagation();
  this.dragHandle.set({ connId, index });

  const move = (e: MouseEvent) => {
    const handle = this.dragHandle();
    if (!handle) return;

    const conns = this.connections();
    const conn = conns.find(x => x.id === handle.connId);
    if (!conn || !conn.manual || !conn.manualPoints) return;

    // Snap movement to grid
    const x = Math.round(e.offsetX / this.ROUTE_STEP) * this.ROUTE_STEP;
    const y = Math.round(e.offsetY / this.ROUTE_STEP) * this.ROUTE_STEP;

    conn.manualPoints[handle.index] = { x, y };
    this.connections.set([...conns]); // trigger redraw
  };

  const up = () => {
    this.dragHandle.set(null);
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}




onWireMouseDown(conn: Connection, ev: MouseEvent) {
  ev.stopPropagation();

  // Ensure we have a manual template path
  if (!conn.manual || !conn.manualPoints || conn.manualPoints.length < 2) {
    const auto = this.pathCache.get(conn.id);
    if (auto && auto.length >= 2) {
      conn.manual = true;
      conn.manualPoints = auto.map(p => ({ x: p.x, y: p.y }));
    } else {
      return; // nothing to drag
    }
  }

  this.editingConnId.set(conn.id);

  const startX = ev.clientX;
  const startY = ev.clientY;
  const original = conn.manualPoints!.map(p => ({ x: p.x, y: p.y }));

  const move = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Move the template path as a block (including its own endpoints)
    conn.manualPoints = original.map(p => ({
      x: p.x + dx,
      y: p.y + dy,
    }));

    this.connections.set([...this.connections()]); // redraw
  };

  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };

  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}



// getPolylinePoints(conn: Connection): string {
//   // Serve from cache if we already routed this one in this render pass

//     // If manual, recompute endpoints but preserve the middle points
//   if (conn.manual && conn.manualPoints && conn.manualPoints.length >= 2) {

//     const start = this.connectorCenter(conn.from);
//     const end   = this.connectorCenter(conn.to);

//     if (!start || !end) return '';

//     // Replace endpoints only
//     const pts: Pt[] = [
//       start,
//       ...conn.manualPoints.slice(1, conn.manualPoints.length - 1),
//       end
//     ];

//     return pts.map(p => `${p.x},${p.y}`).join(' ');
//   }



//   const cached = this.pathCache.get(conn.id);
//   if (cached) {
//     return cached.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
//   }

//   const a = this.connectorCenter(conn.from);
//   const b = this.connectorCenter(conn.to);
//   if (!a || !b) return '';

//   const snap = (n: number, step = this.ROUTE_STEP) => Math.round(n / step) * step;
//   const stubLen = Math.max(this.ROUTE_STEP, Math.ceil(this.STUB_LEN / this.ROUTE_STEP) * this.ROUTE_STEP);

//   const aGrid = { x: snap(a.x), y: snap(a.y) };
//   const bGrid = { x: snap(b.x), y: snap(b.y) };

//   const aStub = {
//     x: aGrid.x,
//     y: conn.from.port === 'top' ? snap(aGrid.y - stubLen) : snap(aGrid.y + stubLen),
//   };
//   const bStub = {
//     x: bGrid.x,
//     y: conn.to.port === 'top' ? snap(bGrid.y - stubLen) : snap(bGrid.y + stubLen),
//   };

//   // fan-out lanes ONLY at destination
//   const laneOffset = (ref: ConnectorRef) => {
//     const { index, total } = this.portSlot(ref, conn.id);
//     if (total <= 1) return 0;
//     const center = (total - 1) / 2;
//     const raw = (index - center) * this.FANOUT_GAP;
//     return snap(raw);
//   };
//   const toDx = laneOffset(conn.to);
//   const bStubOff = { x: snap(bStub.x + toDx), y: bStub.y };

//   // small guards to avoid micro loops
//   const cellRect = (cx: number, cy: number): Rect => {
//     const s = this.ROUTE_STEP;
//     return { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
//   };
//   const startStubDir = conn.from.port === 'top' ? -1 : +1;
//   const endStubDir   = conn.to.port   === 'top' ? -1 : +1;
//   const aAnchor = { x: aStub.x, y: aStub.y };
//   const bAnchor = { x: bStubOff.x, y: bStubOff.y };
//   const startGuard = cellRect(aAnchor.x, aAnchor.y - startStubDir * this.ROUTE_STEP);
//   const endGuard   = cellRect(bAnchor.x, bAnchor.y - endStubDir   * this.ROUTE_STEP);

//   const width  = this.panelRef.nativeElement.clientWidth || (this.getRailLeft() + this.RAIL_WIDTH * 2);
//   const height = this.panelHeight();

//   // Components block & rails block (your existing logic)
//   const fromPart = this.parts().find(q => q.id === conn.from.partId)!;
//   const toPart   = this.parts().find(q => q.id === conn.to.partId)!;
//   const crossRail = fromPart.railIndex !== toPart.railIndex;

//   const upper    = this.railsTop()[fromPart.railIndex] < this.railsTop()[toPart.railIndex] ? fromPart : toPart;
//   const lower    = upper === fromPart ? toPart : fromPart;
//   const portsAreTopOfLower_to_BottomOfUpper =
//     (conn.from.partId === lower.id && conn.from.port === 'top' && conn.to.partId === upper.id && conn.to.port === 'bottom') ||
//     (conn.to.partId   === lower.id && conn.to.port   === 'top' && conn.from.partId === upper.id && conn.from.port === 'bottom');
//   const allowDirectVertical =
//     crossRail && this.verticallyAligned(fromPart, toPart) && portsAreTopOfLower_to_BottomOfUpper;

//   let preferredSide: 'left' | 'right' | null = null;
//   if (crossRail && !allowDirectVertical) {
//     if (this.isLeftmostOnRail(fromPart)) preferredSide = 'left';
//     else if (this.isRightmostOnRail(fromPart)) preferredSide = 'right';
//   }

//   const railLeft  = this.getRailLeft();
//   const railRight = railLeft + this.RAIL_WIDTH;

//   const partRects = this.parts().map(p => this.inflate(this.partRectAbs(p), this.OBSTACLE_CLEAR));

//   const railsRects: Rect[] = [];
//   for (const y of this.railsTop()) {
//     if (allowDirectVertical) {
//       const minY = Math.min(aStub.y, bStub.y);
//       const maxY = Math.max(aStub.y, bStub.y);
//       if (y >= minY && y <= maxY) continue;
//     }
//     railsRects.push({
//       x: railLeft,
//       y: y - this.RAIL_BLOCK_THICK / 2,
//       w: this.RAIL_WIDTH,
//       h: this.RAIL_BLOCK_THICK,
//     });
//   }

//   const sideWalls: Rect[] = [];
//   if (preferredSide) {
//     const minY = Math.min(aStub.y, bStub.y);
//     const maxY = Math.max(aStub.y, bStub.y);
//     if (preferredSide === 'left') {
//       sideWalls.push({ x: railRight, y: minY, w: Math.max(1, (this.panelRef.nativeElement.clientWidth - railRight)), h: maxY - minY });
//     } else {
//       sideWalls.push({ x: 0, y: minY, w: Math.max(1, railLeft), h: maxY - minY });
//     }
//   }

//   // ⛔️ NEW: wires from *other* sources are obstacles → prevents overlap anywhere
//   const foreignWireRects = this.foreignWireRectsFor(conn);

//   // Final obstacles (flattened)
//   // const obstacles: Rect[] = [
//   //   ...partRects,
//   //   ...railsRects,
//   //   ...sideWalls,
//   //   startGuard,
//   //   endGuard,
//   //   ...foreignWireRects,
//   // ];

  
// // 1) Start with your existing obstacles (parts/rails/side walls + destination guard)
// let obstacles: Rect[] = [
//   ...partRects,
//   ...railsRects,
//   ...sideWalls,
//   endGuard,
// ];

//   // Route between anchors
//   const routed = this.routeOrthogonal(
//     aAnchor,
//     bAnchor,
//     obstacles,
//     { w: width, h: height },
//     this.ROUTE_STEP
//   );

//   // Destination “entry nub” (keeps tiny gap at the port and 90° approach)
//   const entryNub = this.ROUTE_STEP;
//   const bNear = {
//     x: bStubOff.x,
//     y: conn.to.port === 'top' ? snap(bGrid.y + entryNub) : snap(bGrid.y - entryNub),
//   };
//   const bLead = { x: bGrid.x, y: bNear.y };

//   const pts: Pt[] = [
//     aGrid,
//     aStub,
//     ...routed,
//     bNear,
//     bLead,
//     bGrid
//   ];

//   const simplified = this.simplifyOrthogonal(pts);

//   // Cache and return
//   this.pathCache.set(conn.id, simplified);
//   return simplified.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
// }

getPolylinePoints(conn: Connection): string {
  // 1) MANUAL MODE: endpoints fixed, interior can stretch, all segments orthogonal
  if (conn.manual && conn.manualPoints && conn.manualPoints.length >= 2) {
    const start = this.connectorCenter(conn.from);
    const end   = this.connectorCenter(conn.to);
    if (!start || !end) return '';

    const raw = conn.manualPoints;

    // interior template (everything except endpoints of the template)
    let interior: Pt[] = [];
    if (raw.length > 2) {
      interior = raw.slice(1, raw.length - 1).map(p => ({ x: p.x, y: p.y }));

      // Orientation of the first template segment (still orthogonal even after translation)
      const startVertical = raw[1].x === raw[0].x;
      if (interior.length >= 1) {
        if (startVertical) {
          // first segment vertical → share x with start
          interior[0].x = start.x;
        } else {
          // first segment horizontal → share y with start
          interior[0].y = start.y;
        }
      }

      // Orientation of the last template segment
      const endVertical = raw[raw.length - 1].x === raw[raw.length - 2].x;
      if (interior.length >= 1) {
        const lastIdx = interior.length - 1;
        if (endVertical) {
          // last segment vertical → share x with end
          interior[lastIdx].x = end.x;
        } else {
          // last segment horizontal → share y with end
          interior[lastIdx].y = end.y;
        }
      }
    }

    const pts: Pt[] = [start, ...interior, end];
    return pts
      .map(p => `${Math.round(p.x)},${Math.round(p.y)}`)
      .join(' ');
  }

  // 2) AUTO MODE (unchanged – your current routing logic)
  const cached = this.pathCache.get(conn.id);
  if (cached) {
    return cached.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
  }

  const a = this.connectorCenter(conn.from);
  const b = this.connectorCenter(conn.to);
  if (!a || !b) return '';

  const snap = (n: number, step = this.ROUTE_STEP) =>
    Math.round(n / step) * step;
  const stubLen = Math.max(
    this.ROUTE_STEP,
    Math.ceil(this.STUB_LEN / this.ROUTE_STEP) * this.ROUTE_STEP
  );

  const aGrid = { x: snap(a.x), y: snap(a.y) };
  const bGrid = { x: snap(b.x), y: snap(b.y) };

  const aStub = {
    x: aGrid.x,
    y:
      conn.from.port === 'top'
        ? snap(aGrid.y - stubLen)
        : snap(aGrid.y + stubLen),
  };
  const bStub = {
    x: bGrid.x,
    y:
      conn.to.port === 'top'
        ? snap(bGrid.y - stubLen)
        : snap(bGrid.y + stubLen),
  };

  const laneOffset = (ref: ConnectorRef) => {
    const { index, total } = this.portSlot(ref, conn.id);
    if (total <= 1) return 0;
    const center = (total - 1) / 2;
    const rawOff = (index - center) * this.FANOUT_GAP;
    return snap(rawOff);
  };
  const toDx = laneOffset(conn.to);
  const bStubOff = { x: snap(bStub.x + toDx), y: bStub.y };

  const cellRect = (cx: number, cy: number): Rect => {
    const s = this.ROUTE_STEP;
    return { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
  };
  const startStubDir = conn.from.port === 'top' ? -1 : +1;
  const endStubDir = conn.to.port === 'top' ? -1 : +1;
  const aAnchor = { x: aStub.x, y: aStub.y };
  const bAnchor = { x: bStubOff.x, y: bStubOff.y };
  const startGuard = cellRect(
    aAnchor.x,
    aAnchor.y - startStubDir * this.ROUTE_STEP
  );
  const endGuard = cellRect(
    bAnchor.x,
    bAnchor.y - endStubDir * this.ROUTE_STEP
  );

  const width =
    this.panelRef.nativeElement.clientWidth ||
    this.getRailLeft() + this.RAIL_WIDTH * 2;
  const height = this.panelHeight();

  const fromPart = this.parts().find(q => q.id === conn.from.partId)!;
  const toPart = this.parts().find(q => q.id === conn.to.partId)!;
  const crossRail = fromPart.railIndex !== toPart.railIndex;

  const upper =
    this.railsTop()[fromPart.railIndex] <
    this.railsTop()[toPart.railIndex]
      ? fromPart
      : toPart;
  const lower = upper === fromPart ? toPart : fromPart;
  const portsAreTopOfLower_to_BottomOfUpper =
    (conn.from.partId === lower.id &&
      conn.from.port === 'top' &&
      conn.to.partId === upper.id &&
      conn.to.port === 'bottom') ||
    (conn.to.partId === lower.id &&
      conn.to.port === 'top' &&
      conn.from.partId === upper.id &&
      conn.from.port === 'bottom');
  const allowDirectVertical =
    crossRail &&
    this.verticallyAligned(fromPart, toPart) &&
    portsAreTopOfLower_to_BottomOfUpper;

  let preferredSide: 'left' | 'right' | null = null;
  if (crossRail && !allowDirectVertical) {
    if (this.isLeftmostOnRail(fromPart)) preferredSide = 'left';
    else if (this.isRightmostOnRail(fromPart)) preferredSide = 'right';
  }

  const railLeft = this.getRailLeft();
  const railRight = railLeft + this.RAIL_WIDTH;

  const partRects = this.parts().map(p =>
    this.inflate(this.partRectAbs(p), this.OBSTACLE_CLEAR)
  );

  const railsRects: Rect[] = [];
  for (const y of this.railsTop()) {
    if (allowDirectVertical) {
      const minY = Math.min(aStub.y, bStub.y);
      const maxY = Math.max(aStub.y, bStub.y);
      if (y >= minY && y <= maxY) continue;
    }
    railsRects.push({
      x: railLeft,
      y: y - this.RAIL_BLOCK_THICK / 2,
      w: this.RAIL_WIDTH,
      h: this.RAIL_BLOCK_THICK,
    });
  }

  const sideWalls: Rect[] = [];
  if (preferredSide) {
    const minY = Math.min(aStub.y, bStub.y);
    const maxY = Math.max(aStub.y, bStub.y);
    if (preferredSide === 'left') {
      sideWalls.push({
        x: railRight,
        y: minY,
        w: Math.max(
          1,
          this.panelRef.nativeElement.clientWidth - railRight
        ),
        h: maxY - minY,
      });
    } else {
      sideWalls.push({
        x: 0,
        y: minY,
        w: Math.max(1, railLeft),
        h: maxY - minY,
      });
    }
  }

  const obstacles: Rect[] = [
    ...partRects,
    ...railsRects,
    ...sideWalls,
    endGuard,
  ];

  const routed = this.routeOrthogonal(
    aAnchor,
    bAnchor,
    obstacles,
    { w: width, h: height },
    this.ROUTE_STEP
  );

  const entryNub = this.ROUTE_STEP;
  const bNear = {
    x: bStubOff.x,
    y:
      conn.to.port === 'top'
        ? snap(bGrid.y + entryNub)
        : snap(bGrid.y - entryNub),
  };
  const bLead = { x: bGrid.x, y: bNear.y };

  const pts: Pt[] = [aGrid, aStub, ...routed, bNear, bLead, bGrid];

  const simplified = this.simplifyOrthogonal(pts);
  this.pathCache.set(conn.id, simplified);

  return simplified
    .map(p => `${Math.round(p.x)},${Math.round(p.y)}`)
    .join(' ');
}



  /** Inflate rect by m pixels on all sides */
  private inflate(r: Rect, m: number): Rect {
    return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
  }



  //ALGORITHM BEGINS

  /** Orthogonal, obstacle-avoiding route with A* on a rectilinear grid */
  private routeOrthogonal(start: Pt, goal: Pt, obstacles: Rect[], bounds: { w: number; h: number }, step: number): Pt[] {
    // Convert points to grid
    const toCell = (p: Pt) => ({ cx: Math.round(p.x / step), cy: Math.round(p.y / step) });
    const toPoint = (c: { cx: number; cy: number }): Pt => ({ x: c.cx * step, y: c.cy * step });

    const cols = Math.ceil(bounds.w / step);
    const rows = Math.ceil(bounds.h / step);

    // Build blocked grid
    const blocked = new Uint8Array(cols * rows);
    const markRect = (r: Rect) => {
      const x0 = Math.max(0, Math.floor(r.x / step));
      const y0 = Math.max(0, Math.floor(r.y / step));
      const x1 = Math.min(cols - 1, Math.ceil((r.x + r.w) / step));
      const y1 = Math.min(rows - 1, Math.ceil((r.y + r.h) / step));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          blocked[cy * cols + cx] = 1;
        }
      }
    };
    obstacles.forEach(markRect);

    const s = toCell(start);
    const g = toCell(goal);

    const inBounds = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
    const passable = (cx: number, cy: number) => inBounds(cx, cy) && !blocked[cy * cols + cx];

    // If start/goal land on blocked, try nudging a few cells (rare)
    const nudge = (c: { cx: number; cy: number }) => {
      if (passable(c.cx, c.cy)) return c;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]];
      for (const [dx,dy] of dirs) {
        const nx = c.cx + dx, ny = c.cy + dy;
        if (passable(nx, ny)) return { cx: nx, cy: ny };
      }
      return c;
    };
    const S = nudge(s);
    const G = nudge(g);

    // A* with 4 neighbors (orthogonal)
    const h = (cx: number, cy: number) => Math.abs(cx - G.cx) + Math.abs(cy - G.cy);

    const open: number[] = [];
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const key = (cx: number, cy: number) => cy * cols + cx;

    const startKey = key(S.cx, S.cy);
    open.push(startKey);
    gScore.set(startKey, 0);
    fScore.set(startKey, h(S.cx, S.cy));

    const pushOpen = (k: number) => {
      open.push(k);
    };
    const popLowestF = () => {
      let bestIdx = 0, bestF = Infinity;
      for (let i = 0; i < open.length; i++) {
        const k = open[i];
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) { bestF = f; bestIdx = i; }
      }
      const k = open[bestIdx];
      open.splice(bestIdx, 1);
      return k;
    };

    const neighbors = (cx: number, cy: number) => [
      [cx+1, cy],
      [cx-1, cy],
      [cx, cy+1],
      [cx, cy-1],
    ] as const;

    const closed = new Set<number>();

     while (open.length) {
      const current = popLowestF();
      if (current === key(G.cx, G.cy)) {
        // reconstruct path
        const pathCells: { cx: number; cy: number }[] = [];
        let cur: number | undefined = current;
        while (cur !== undefined) {
          const cy = Math.floor(cur / cols);
          const cx = cur - cy * cols;
          pathCells.push({ cx, cy });
          cur = cameFrom.get(cur);
        }
        pathCells.reverse();
        const rawPts = pathCells.map(toPoint);
        return this.simplifyOrthogonal(rawPts);
      }

      closed.add(current);
      const cy0 = Math.floor(current / cols);
      const cx0 = current - cy0 * cols;

      // Direction we used to ENTER the current cell
      const parentKey = cameFrom.get(current);
      let prevDirX = 0;
      let prevDirY = 0;
      if (parentKey !== undefined) {
        const pcy = Math.floor(parentKey / cols);
        const pcx = parentKey - pcy * cols;
        prevDirX = cx0 - pcx;
        prevDirY = cy0 - pcy;
      }

      for (const [nx, ny] of neighbors(cx0, cy0)) {
        if (!passable(nx, ny)) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;

        // ---- turn-penalised cost ----
        let stepCost = 1;
        const dirX = nx - cx0;
        const dirY = ny - cy0;
        if (prevDirX !== 0 || prevDirY !== 0) {
          // if we change direction, add a penalty
          if (dirX !== prevDirX || dirY !== prevDirY) {
            stepCost += this.TURN_PENALTY;
          }
        }

        const tentative = (gScore.get(current) ?? Infinity) + stepCost;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, current);
          gScore.set(nk, tentative);
          fScore.set(nk, tentative + h(nx, ny));
          if (!open.includes(nk)) pushOpen(nk);
        }
      }
    }


    // Fallback: simple Manhattan (orthogonal) if A* fails (should be rare)
    const fallback: Pt[] = [start, { x: goal.x, y: start.y }, goal];
    return this.simplifyOrthogonal(fallback);
  }





//ALGORITHM ENDS HERE

  /** Remove collinear intermediate points on an orthogonal polyline */
  private simplifyOrthogonal(pts: Pt[]): Pt[] {
    if (pts.length <= 2) return pts.slice();
    const out: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const abx = b.x - a.x, aby = b.y - a.y;
      const bcx = c.x - b.x, bcy = c.y - b.y;
      const collinear = (abx === 0 && bcx === 0) || (aby === 0 && bcy === 0);
      if (!collinear) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

onDeletePart(partId: string, ev?: MouseEvent) {
  ev?.stopPropagation();
  if (this.locked()) return;  // disable after finalize

  const remainingParts = this.parts().filter(p => p.id !== partId);
  if (remainingParts.length === this.parts().length) return;

  this.parts.set(remainingParts);

  // remove any wires referencing this part
  const keepIds = new Set(remainingParts.map(p => p.id));
  this.connections.set(
    this.connections().filter(c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId))
  );

  this.portColors.delete(this.portKey(partId, 'top'));
  this.portColors.delete(this.portKey(partId, 'bottom'));

  // clear pending if it referenced this part
  const pending = this.pendingFrom();
  if (pending && pending.partId === partId) this.pendingFrom.set(null);

   this.invalidatePaths();
}

onDeleteConnection(connId: string, ev?: MouseEvent) {
  ev?.stopPropagation();
  if (this.locked()) return;  // disable after finalize

  this.connections.set(this.connections().filter(c => c.id !== connId));
    this.invalidatePaths();
}

//COLORS

// Map of "<partId>:<port>" -> color
private portColors = new Map<string, string>();

private portKey(partId: string, port: Port) {
  return `${partId}:${port}`;
}

private getOrAssignColor(partId: string, port: Port): string {
  const key = this.portKey(partId, port);
  const existing = this.portColors.get(key);
  if (existing) return existing;

  // Avoid colors already used by any other port, and avoid sibling port color
  const used = new Set(this.portColors.values());
  const sibling = this.portColors.get(this.portKey(partId, port === 'top' ? 'bottom' : 'top'));

  let chosen: string | null = null;
  // try a full pass over the palette starting at colorIndex
  for (let i = 0; i < this.colorCycle.length * 2; i++) {
    const idx = (this.colorIndex + i) % this.colorCycle.length;
    const c = this.colorCycle[idx];
    if (!used.has(c) && c !== sibling) {
      chosen = c;
      this.colorIndex = idx + 1; // advance index only when we pick
      break;
    }
  }
  // Fallback: still avoid sibling if possible
  if (!chosen) {
    for (let i = 0; i < this.colorCycle.length; i++) {
      const c = this.colorCycle[i];
      if (c !== sibling) { chosen = c; this.colorIndex = i + 1; break; }
    }
  }
  // Last resort: just pick next (palette exhausted)
  if (!chosen) {
    chosen = this.colorCycle[this.colorIndex % this.colorCycle.length];
    this.colorIndex++;
  }

  this.portColors.set(key, chosen);
  return chosen;
}

// Remove color entries for parts that no longer exist
private prunePortColors(keepIds: Set<string>) {
  for (const k of Array.from(this.portColors.keys())) {
    const [pid] = k.split(':', 1);
    if (!keepIds.has(pid)) this.portColors.delete(k);
  }
}




}