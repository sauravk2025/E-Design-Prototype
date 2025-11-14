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

import jsPDF from 'jspdf'; //for pdf
import html2canvas from 'html2canvas'; //for pdf


type Port = 'top' | 'bottom'; //decide between top and bottom ports

interface PartType {
  type: string;
  label: string;
  w: number;
  h: number;
} //for each component


//after placing each part in a rail
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
  partId: string; //id of the component
  port: Port; //port
}

interface Connection {
  id: string; //id of wire (Actually created using crypto.randomUUID().)
  from: ConnectorRef; //from connected component
  to: ConnectorRef; //to conncted component
  color: string; //color of wire
  manual: boolean;        // manual wire adjustment or not? TRue when mouseclicked once
  manualPoints?: Pt[];    // The stored polyline in panel coordinates by user
}

// manualPoints: [
//   { x: 300, y: 120 },
//   { x: 300, y: 300 },
//   { x: 500, y: 300 },
//   { x: 500, y: 430 },
// ]
// This describes a polyline like:

// scss
// Copy code
// (300,120) ↓
// (300,300) → 
// (500,300) ↓
// (500,430)

/** Geometry helpers for routing */
interface Pt { x: number; y: number; } //defines a single point

interface Rect { x: number; y: number; w: number; h: number; }
//A rectangle shape on the panel. Rectangles describe obstacles for routing.

@Component({
  selector: 'app-panel-designer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './panel-designer.html',
  styleUrls: ['./panel-designer.scss'],
})


export class PanelDesignerComponent implements AfterViewInit {
  // Layout constants
  readonly MAX_RAILS = 5;             //maximum number of rails = 5
  readonly RAIL_WIDTH = 640;          // rail width of each rail
  readonly RAIL_SPACING = 200;        // margin-top before every rail
  readonly LAST_BOTTOM_MARGIN = 250;  // extra bottom space after last rail
  readonly CONNECTOR_SIZE = 15;   //size of clickabel connector button on top of component
  readonly GRID = 5; //it is used to position at defined pixel position. 
  //(234.7, 102.3) , (398.2, 251.9) to (235, 100)(400, 250) to adjust the positon of components, wires etc
  // Router tuning
  readonly ROUTE_STEP = 10;          // ROUTE_STEP defines the grid size (in pixels) used by the A*-routing algorithm.
          //This means:Routing search happens on a 10px x 10px grid.Every wire bend (corner) occurs at multiples of 10
  readonly OBSTACLE_CLEAR = 5;       // inflate obstacles (px) to avoid collision
  readonly STUB_LEN = 9;            // initial vertical stub length from connector (px)
  readonly RAIL_BLOCK_THICK = 12;    // Thickness” of the blocking rectangle placed over each rail.
  readonly FANOUT_GAP = 10;         // Spacing between wires coming out from the same port.
  readonly TURN_PENALTY = 4;    //whenever it takes a turn adds a penalty so that it takes a straight line

  // --- NEW: wire overlap avoidance ---
  readonly WIRE_CLEAR = 6;     // Wire path should avoid existing wires:
  readonly WIRE_STROKE = 3;    // stroke width for polyline (same as SVG stroke-width).
  
  private readonly SOURCE_GAP = 12; //This is the horizontal spacing between wires that start from different connectors on the SAME component.
  
  private WIRE_BLOCK_THICK = 8; //Thickness of wire rectangle used to block routing area around an existing wire.
  
  private pathCache = new Map<string, Pt[]>();   // pathCache stores the auto-routed polyline points (Pt[]) for each connection, indexed by the connection ID.
  private pathEpoch = 0; //pathEpoch is a version counter that lets the router know:"The environment changed, re-route everything! Increases when Dragging a component ,Deleting or adding a component, Adding/removing connections etc
  

  railsCount = signal<number>(1); //number of rails
  locked = signal<boolean>(false); //locked() == true after we click finalise layout

  //components used
  toolbox: PartType[] = [
    { type: 'SP',       label: 'SP',       w: 80,  h: 80  },
    { type: 'MCB_1P',   label: 'MCB 1P',   w: 90,  h: 90  },
    { type: 'MCB_2P',   label: 'MCB 2P',   w: 100, h: 100 },
    { type: 'MCB_3P',   label: 'MCB_3P',   w: 110, h: 110 },
    { type: 'CN-10/30',   label: 'CN-10/30',   w: 100, h: 90  },
    { type: 'CN-10A',   label: 'CN-10A',   w: 100, h: 90  },
    { type: 'C3N-13A',  label: 'C3N-13A',  w: 130, h: 120 },
    { type: 'C3N-16A',  label: 'C3N-16A',  w: 130, h: 120 },
    { type: 'RCD',      label: 'RCD',      w: 130, h: 120 },
  ];

  

  parts = signal<PlacedPart[]>([]); //The array of all components placed on the panel.
  connections = signal<Connection[]>([]); //All the wires drawn between components.
  pendingFrom = signal<ConnectorRef | null>(null); //The connector the user clicked first before drawing a wire.
  // Visual-only drag state (kept from your version)
  isDragging = signal<boolean>(false); //check if user is dragging
  hoverRailIndex = signal<number | null>(null);//The index of the rail that the mouse is currently hovering over.used in dragging
  preview = signal<{ x: number; w: number; h: number; railIndex: number } | null>(null); //A fake “ghost component” drawn under the mouse while dragging from toolbox or dragging on panel.
  draggingPartId = signal<string | null>(null);//The ID of the component currently being dragged.
  editingConnId = signal<string | null>(null); //The connection (wire) currently being manually edited.
  dragHandle = signal<{connId: string; index: number} | null>(null); //The specific handle/bend point of the wire the user is dragging.


  private colorCycle = [
  '#eb0d0dff', // strong red
  '#1976D2', // pure blue
  '#63c768ff', // pure green
  '#620988ff', // deep purple
  '#F57C00', // deep orange
  '#c95e89ff', // magenta / pinkish
  '#865bebff', // indigo
  '#00796B', // teal (not close to green)
  '#5D4037', // dark brown
  '#000000'  // black
];



  private colorIndex = 0; //for traversing across the colorCycle array

  private invalidatePaths() { this.pathCache.clear(); } //if component are dragged of we do anything we need to calculate new routes . so we clear the previuosly stored values . So clearing the cache forces the app to:Recalculate the wire routes fresh the next time getPolylinePoints() runs.


  //Rounding a number to the nearest grid point.grid” is a spacing system that keeps: wires straight,90° angles clean, routing predictable
  private snap(n: number, step = this.ROUTE_STEP) {
  return Math.round(n / step) * step;
  }

/** Center X of a placed part in panel coords */
  //It returns the absolute X coordinate (horizontal position) of the center of a component on the panel.
  //to check Whether two parts are vertically aligned
  private partCenterX(p: PlacedPart): number {
  const railLeft = this.getRailLeft();
  return railLeft + p.x + p.w / 2;
}


/** Is this part the leftmost on its rail (within GRID tolerance)?  to route through left side*/
private isLeftmostOnRail(p: PlacedPart): boolean {
  const onRail = this.parts().filter(x => x.railIndex === p.railIndex);
  if (!onRail.length) return false;
  const minX = Math.min(...onRail.map(x => x.x));
  return Math.abs(p.x - minX) <= this.GRID; //returns a boolean
}


/** Is this part the rightmost on its rail (within GRID tolerance)? to route through the right side*/
private isRightmostOnRail(p: PlacedPart): boolean {
  const onRail = this.parts().filter(x => x.railIndex === p.railIndex);
  if (!onRail.length) return false;
  const maxRight = Math.max(...onRail.map(x => x.x + x.w));
  return Math.abs((p.x + p.w) - maxRight) <= this.GRID; //returns a boolean
}


/** Deterministic ordering for those connections so lanes don't shuffle */
//Determine a consistent, stable ordering of multiple wires connected to the same port of source
//Ensures fan-out lanes work perfectly so that there is a gap between wires
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
//This information is used to compute horizontal offsets so wires leave a connector in neatly spaced lines.
private portSlot(ref: ConnectorRef, connId: string): { index: number; total: number } {
  const conns = this.sortConnsForPort(this.connectionsAtPort(ref), ref);
  const index = Math.max(0, conns.findIndex(c => c.id === connId));
  return { index, total: conns.length };
}


/** Returns all connections that touch a given port (both directions) */
//you get a complete list of all wires attached to a specific connector dot.
private connectionsAtPort(ref: ConnectorRef): Connection[] {
  const list = this.connections();
  return list.filter(c =>
    (c.from.partId === ref.partId && c.from.port === ref.port) ||
    (c.to.partId   === ref.partId && c.to.port   === ref.port)
  );
}



/** Are two parts vertically aligned (centers within one grid step)? */
// Are the two components placed exactly above/below each other vertically?
//if true we draw straight lines between them
private verticallyAligned(a: PlacedPart, b: PlacedPart): boolean {
  return Math.abs(this.partCenterX(a) - this.partCenterX(b)) <= this.GRID;
}


  // Rails Y positions: (i+1) * 200 
  //It returns an array of Y-coordinates for each rail.
  railsTop = computed(() =>
    Array.from({ length: this.railsCount() }, (_, i) => (i + 1) * this.RAIL_SPACING)
  );


  //Returns the total height of your panel, including bottom margin.
  // Panel height: last rail plus bottom margin
  panelHeight = computed(() => {
    const n = this.railsCount();
    if (n === 0) return this.LAST_BOTTOM_MARGIN;
    return this.railsTop()[n - 1] + this.LAST_BOTTOM_MARGIN;
  });

  //Returns only the connections whose both endpoints still exist.
  //if user deletes a component then all connection attached to it must be removed
  /** Only render connections that still have both endpoints */
  visibleConnections = computed(() => {
    const keep = new Set(this.parts().map(p => p.id));
    return this.connections().filter(
      c => keep.has(c.from.partId) && keep.has(c.to.partId)
    );
  });

  //We sort connections to make rendering deterministic.
//   Sorting guarantees:

// ✔ No wire flickering

// ✔ No random top/bottom layering

// ✔ Consistent drawing order

// ✔ Stable PDF output

// ✔ Predictable visuals when dragging components

// ✔ Clean grouping of wires from the same part

// Without sorting →
// wires jump, flicker, and appear unpredictably reordered.

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
            // What signals does it react to?
            // this.railsCount()
            // this.parts()
            // this.connections()
            // this.pendingFrom()
            // Any change to these will rerun this block.
    });


    effect(() => {
      const conns = this.connections();         // signal dependency
      this.pathCache.clear();
      this.pathEpoch++;                          // bump so we can force rebuild order
      //React to any change in connections
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
      //If any connection points to a deleted part → delete that connection.
    });


    effect(() => {
      const snapshot = JSON.stringify({
        parts: this.parts(),
        conns: this.connections()
      });
      // touching this effect guarantees it runs when either changes
      // (we only need the side-effect)
      this.invalidatePaths();

        // Whenever parts change → wires must be rerouted.

        // Whenever connections change → wires must be rerouted.

        // This effect ensures pathCache is invalidated regardless of which one changed.
    });

  }



  // Rails count (1..5), disabled when locked (selector itself also disabled in HTML)
  //This function updates the number of rails in the panel and ensures the entire system stays valid and consistent after the change.Prevent changes when layout is locked. Remove parts that are placed on rails that no longer exist when rail count decreases. Remove connections that reference removed parts. Remove color assignments for deleted ports
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


  // Center rails horizontally in the panel container
  //It returns how many pixels from the left side the rails should be placed so they appear perfectly centered in the panel.
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


//It is called when you release the mouse after dragging a toolbox item into the panel.
//In other words:This function actually creates the component in your layout.Everything before this was only visual preview.
  
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
  //Meaning:When the user clicks “Finalize Layout” → locked = true; connectors become visible
  // When layout is not finalized (locked = false) → connectors are hidden
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

  //Remembers the first clicked connector (start point). Waits for the second click (end point) . Creates a Connection between those two points. Prevents self-connection (same part → ignored). Picks a color for the wire (based on source port). Clears the pending state after connection
  
  
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


  // Only X-axis overlap matters because all boxes are centered vertically on the rail
  //collides() checks whether a new component you are trying to place overlaps (collides) horizontally with any existing component on the same rail.
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

  //When you click anywhere on the empty panel area (not on connectors, not on components), this function:If you clicked one connector (first click of wiring) But changed your mind or misclicked. Clicking the empty panel cancels the wire creation
  onPanelClick() {
    if (this.pendingFrom()) this.pendingFrom.set(null);
  }

  // ======================= ORTHOGONAL ROUTER ================================

  /** Build absolute panel-space rect for a part (including rail offset + centering) */
  //It computes the exact X, Y, width, and height of a component in the SVG/panel space.
  private partRectAbs(p: PlacedPart): Rect {
    const railLeft = this.getRailLeft();
    const railY = this.railsTop()[p.railIndex];
    return { x: railLeft + p.x, y: railY - p.h / 2, w: p.w, h: p.h };
  }

  /** Connector center in panel coords (inside edge center) */
  //It returns the exact pixel position (x, y) of a connector knob (top or bottom) in absolute panel coordinates, so the wire router knows: where a connection startswhere a connection ends

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

  //When a user clicks a wire, this function converts it from auto-routed to manual (by saving the current path as editable points), highlights it as the selected wire, and prepares it for dragging/editing.
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

  //onHandleDown() lets the user drag an individual point of a manual wire, snapping it to grid and updating the wire’s polyline  until the mouse is released
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


//onWireMouseDown() lets the user drag the entire wire by converting it to a manual path if needed and then shifting all its polyline points as the mouse moves
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



//getPolylinePoints() returns the exact polyline path for a wire—either using the user’s manual shape or automatically routing a new clean orthogonal path around obstacles.
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

  /** Inflate the components by m pixels on all sides to prevent collision */
  private inflate(r: Rect, m: number): Rect {
    return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
  }

  //ALGORITHM BEGINS
  /** Orthogonal, obstacle-avoiding route with A* on a rectilinear grid */
  //routeOrthogonal() uses A* pathfinding to compute a clean orthogonal (90°) wire route between two points, avoiding obstacles and minimizing turns.*
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
  /*It removes unnecessary points from a polyline when three consecutive points lie on the same straight line (horizontal or vertical).Meaning:If the wire has A → B → C and B is not a bend (a turn), B gets removed. */
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


  //deleting a component
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

//to delete a connection line
onDeleteConnection(connId: string, ev?: MouseEvent) {
  ev?.stopPropagation();
  if (this.locked()) return;  // disable after finalize

  this.connections.set(this.connections().filter(c => c.id !== connId));
    this.invalidatePaths();
}

//COLOR Assignments

// Map of "<partId>:<port>" -> color
private portColors = new Map<string, string>(); //A Map that stores which color is assigned to each connector port.

/*It creates a unique key string for a connector port.
Example:
portKey("mcb_123", "top")  →  "mcb_123:top"
portKey("rcd_55", "bottom") → "rcd_55:bottom" */
private portKey(partId: string, port: Port) {
  return `${partId}:${port}`;
}

//assign color to wires
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


/// downloading as pdf

async exportAsPdf() {
  const panelEl = this.panelRef?.nativeElement;
  if (!panelEl) return;

  // Optionally ensure everything is visible/locked before capture
  // this.locked.set(true);

  // Use html2canvas to capture the *entire* panel element (not just visible viewport)
  const canvas = await html2canvas(panelEl, {
    scale: 2,                 // higher resolution
    scrollX: 0,
    scrollY: -window.scrollY, // avoid scroll offset issues
    useCORS: true,
  });

  const imgData = canvas.toDataURL('image/png');

  // Create a PDF (A4 portrait)
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;

  // Compute scale so the whole panel fits on ONE page
  const ratio = Math.min(pdfWidth / imgWidthPx, pdfHeight / imgHeightPx);
  const imgWidthMm = imgWidthPx * ratio;
  const imgHeightMm = imgHeightPx * ratio;

  // Center the image on the page
  const x = (pdfWidth - imgWidthMm) / 2;
  const y = (pdfHeight - imgHeightMm) / 2;

  pdf.addImage(imgData, 'PNG', x, y, imgWidthMm, imgHeightMm);

  pdf.save('panel-layout.pdf');
}

}