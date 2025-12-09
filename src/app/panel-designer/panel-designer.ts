import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  computed,
  effect,
  AfterViewInit,
  inject,
} from '@angular/core';

import { PartType,PlacedPart,Port,ConnectorRef,Connection,Pt,Rect } from '../shared/interfaces';
import { CommonModule } from '@angular/common';
import { Common } from '../shared/common';
import { Header } from "../header/header";
import { colorCycle,ComponentList } from '../shared/constants';
import { ComponentLibrary } from "../component-library/component-library";
import { MAX_RAILS, RAIL_WIDTH, RAIL_SPACING, LAST_BOTTOM_MARGIN, CONNECTOR_SIZE, GRID, ROUTE_STEP, OBSTACLE_CLEAR, STUB_LEN, RAIL_BLOCK_THICK, FANOUT_GAP, TURN_PENALTY, WIRE_CLEAR, WIRE_STROKE} from '../shared/constants';



@Component({
  selector: 'app-panel-designer',
  standalone: true,
  imports: [CommonModule, Header, ComponentLibrary],
  templateUrl: './panel-designer.html',
  styleUrls: ['./panel-designer.scss'],
})



export class PanelDesignerComponent implements AfterViewInit {

  private commonService = inject(Common);
  
  readonly MAX_RAILS = MAX_RAILS;             //maximum number of rails = 5
  readonly RAIL_WIDTH = RAIL_WIDTH;          // rail width of each rail
  readonly RAIL_SPACING = RAIL_SPACING;        // margin-top before every rail
  readonly LAST_BOTTOM_MARGIN = LAST_BOTTOM_MARGIN;  // extra bottom space after last rail
  readonly CONNECTOR_SIZE = CONNECTOR_SIZE;   //size of clickabel connector button on top of component
  readonly GRID = GRID; //it is used to position at defined pixel position. 
  //(234.7, 102.3) , (398.2, 251.9) to (235, 100)(400, 250) to adjust the positon of components, wires etc
  // Router tuning
  readonly ROUTE_STEP = ROUTE_STEP;          // ROUTE_STEP defines the grid size (in pixels) used by the A*-routing algorithm.
  //This means:Routing search happens on a 10px x 10px grid.Every wire bend (corner) occurs at multiples of 10
  readonly OBSTACLE_CLEAR = OBSTACLE_CLEAR;       // inflate obstacles (px) to avoid collision
  readonly STUB_LEN = STUB_LEN;            // initial vertical stub length from connector (px)
  // readonly RAIL_BLOCK_THICK = 12;    // Thickness” of the blocking rectangle placed over each rail.
  readonly RAIL_BLOCK_THICK = RAIL_BLOCK_THICK
  readonly FANOUT_GAP = FANOUT_GAP;         // Spacing between wires coming out from the same port.
  readonly TURN_PENALTY = TURN_PENALTY;    //whenever it takes a turn adds a penalty so that it takes a straight line
  readonly WIRE_CLEAR = WIRE_CLEAR;     // Wire path should avoid existing wires:
  readonly WIRE_STROKE = WIRE_STROKE;    // stroke width for polyline (same as SVG stroke-width).

  //private readonly SOURCE_GAP = 12; //This is the horizontal spacing between wires that start from different connectors on the SAME component.
  private usedColors = new Set<string>();  // all colors ever used for any wire
  //private WIRE_BLOCK_THICK = 8; //Thickness of wire rectangle used to block routing area around an existing wire.
  private pathCache = new Map<string, Pt[]>();   // pathCache stores the auto-routed polyline points (Pt[]) for each connection, indexed by the connection ID.
  private pathEpoch = 0; //pathEpoch is a version counter that lets the router know:"The environment changed, re-route everything! Increases when Dragging a component ,Deleting or adding a component, Adding/removing connections etc
  private colorIndex = 0; //for traversing across the colorCycle array
  
  private colorCycle = colorCycle
  toolbox = ComponentList;

  isDragging = this.commonService.isDragging;
  hoverRailIndex = this.commonService.hoverRailIndex;
  preview = this.commonService.preview;
  railsCount = this.commonService.railsCount
  parts = this.commonService.parts
  locked = this.commonService.locked;
  // railsCount = signal<number>(1); //number of rails
  // locked = signal<boolean>(false); //locked() == true after we click finalise layout
  // isDragging = signal<boolean>(false); //check if user is dragging
  //hoverRailIndex = signal<number | null>(null);//The index of the rail that the mouse is currently hovering over.used in dragging
  //preview = signal<{ x: number; w: number; h: number; railIndex: number; images: string } | null>(null); //A fake “ghost component” drawn under the mouse while dragging from toolbox or dragging on panel.
//parts = signal<PlacedPart[]>([]); //The array of all components placed on the panel.


  totalRailPrice = signal<number>(1500);
  totalProductPrice = signal<number>(0)
  newArrayofConnections = signal<{ fromPartId: string, fromPartConnector: string, toPartId: string, toPartConnector: string, connectionId: string }[] | []>([])
  //components used
  connections = signal<Connection[]>([]); //All the wires drawn between components.
  pendingFrom = signal<ConnectorRef | null>(null); //The connector the user clicked first before drawing a wire.
  // Visual-only drag state (kept from your version)
  draggingPartId = signal<string | null>(null);//The ID of the component currently being dragged.
  editingConnId = signal<string | null>(null); //The connection (wire) currently being manually edited.
  dragHandle = signal<{ connId: string; index: number } | null>(null); //The specific handle/bend point of the wire the user is dragging.
  selectedPart: { id: string, port: string } | null = null;
  connectionFromPartDetails = ''
  connectionFromPortDetails = ''
  connectionToPartDetails = ''
  connectionToPortDetails = ''

  
 

  private invalidatePaths() {
    this.pathCache.clear();  //wipe the cache and let the router recompute clean orthogonal paths.
    //PATHCACHE looks like this
    //key: "2ca2fb40-16ae-45d6-b570-7b3bb1c6a25d" - connection id
    // value: Array(4)
    // 0: {x: 540, y: 270}
    // 1: {x: 540, y: 300}
    // 2:{x: 680, y: 300}
    // 3: {x: 680, y: 270}
    //Whenever a new auto-connected wire path is computed → it gets stored in pathCache
    //Whenever any component OR wire is added, deleted, moved, or modified → pathCache.clear() runs
    //CACHE is stored so that next we draw the same line instead of recalculating it we can identify this 
  }
  //PathCache is a temporary memory where you store the auto-routed path for each wire.It’s a Map where:
  // Key = connection ID (like "d4cb98e8-ab30-4694-bf55-094480445192").Value = Pt[] → list of points [{x, y}] that form the polyline.
  //UI may refresh 5, 10, or 50 times (resize, zoom, other data changes)During these UI refreshes, the app reuses cached wire path instantly. hence speed is improved. pathCahce is cleared whenevr a change in design occurs


  // //Rounding a number to the nearest grid point.grid” is a spacing system that keeps: wires straight,90° angles clean, routing predictable
  // private snap(n: number, step = this.ROUTE_STEP) {
  // return Math.round(n / step) * step;
  // }

  /** Center X of a placed part in panel coords */
  //It returns the absolute X coordinate (horizontal position) of the center of a component on the panel.
  //to check Whether two parts are vertically aligned
  //used to place the connectors in the center
  // if 2 parts are straight, then we can draw a straight line
  private partCenterX(p: PlacedPart): number {
    const railLeft = this.getRailLeft();
    //p.x - distance of the component from the left edge of the rail
    return railLeft + p.x + p.w / 2;
  }


  /** Is this part the leftmost on its rail (within GRID tolerance)?  to route through left side*/
  //returns Boolean
  private isLeftmostOnRail(p: PlacedPart): boolean {
    const onRail = this.parts().filter(x => x.railIndex === p.railIndex);//get all parts on same rail index as current part
    if (!onRail.length) return false; //if no parts
    const minX = Math.min(...onRail.map(x => x.x)); //find minimum x value of the selectd parts on the same rail
    //p - is source
    return Math.abs(p.x - minX) <= this.GRID; //returns a boolean
  }


  /** Is this part the rightmost on its rail (within GRID tolerance)? to route through the right side*/
  //simliar to above
  private isRightmostOnRail(p: PlacedPart): boolean {
    const onRail = this.parts().filter(x => x.railIndex === p.railIndex);
    if (!onRail.length) return false;
    const maxRight = Math.max(...onRail.map(x => x.x + x.w));
    return Math.abs((p.x + p.w) - maxRight) <= this.GRID; //returns a boolean
  }


  /** Deterministic ordering for those connections so lanes don't shuffle */
  //Determine a consistent, stable ordering of multiple wires connected to the same port of source
  //Ensures fan-out lanes work perfectly so that there is a gap between wires
  //takes all wires connected to one connector and sorts them in a fixed, stable order so the wires always come out neat and consistent.
  private sortConnsForPort(conns: Connection[], ref: ConnectorRef): Connection[] {
    //conns - list of wires attached to panel and ref is the panel to whch these wires are attached
    //find the other end of each wire
    const other = (c: Connection) =>
      (c.from.partId === ref.partId && c.from.port === ref.port) ? c.to : c.from;

    //it sorts all wires connected to the same connector by: which component they go to (partId), then top/bottom port order, and finally id to guarantee the order never changes. This keeps wires neat and prevents flickering or random shuffling in the UI.

    /*Sorting priority (rules it follows)
     Group wires by the other connected part (partId alphabetically)
     If both wires go to the same part, sort by port
     'top' port wires come first
     'bottom' port wires come later
     If both part and port are same, sort by wire id
     → this keeps order stable every time and avoids shuffle. */

    //sort all the wires attached to that panel
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
  //1)How many wires are connected to this connector
  //2)Which position (order number) this particular wire has among them →
  private portSlot(ref: ConnectorRef, connId: string): { index: number; total: number } {
    //here ref is to which port the wire is conencted

    //sortConnsForPort(list of wires attached to element, that element)
    const conns = this.sortConnsForPort(this.connectionsAtPort(ref), ref);

    const index = Math.max(0, conns.findIndex(c => c.id === connId));

    //index means the position number of a specific wire among all wires that are connected to the same connector port, starting from 0.
    return { index, total: conns.length };
  }


  /** Returns all connections that touch a given port (both directions) */
  //you get a complete list of all wires attached to a specific connector dot.
  //the connection can be from that dot or to that do
  private connectionsAtPort(ref: ConnectorRef): Connection[] {
    const list = this.connections();
    //list is the list of wires attached to that connector
    return list.filter(c =>
      (c.from.partId === ref.partId && c.from.port === ref.port) ||
      (c.to.partId === ref.partId && c.to.port === ref.port)
    );
  }



  /** Are two parts vertically aligned (centers within one grid step)? */
  // Are the two components placed exactly above/below each other vertically?
  //if true we draw straight lines between them
  private verticallyAligned(a: PlacedPart, b: PlacedPart): boolean {
    return Math.abs(this.partCenterX(a) - this.partCenterX(b)) <= this.GRID;
    //here we compare with grid so that small difference in value is accepted as straight line. If difference between centeres is 2 which is less than grid (5) , so we can draw straight lines
  }


  // Rails Y positions: (i+1) * 200 
  //It returns an array of Y-coordinates for each rail.that is y cordinate of each rail from panel top
  railsTop = computed(() =>
    Array.from({ length: this.railsCount() }, (_, i) => (i + 1) * this.RAIL_SPACING)
  );


  //Returns the total height of your panel, including bottom margin.
  // Panel height: last rail plus bottom margin
  panelHeight = computed(() => {
    const n = this.railsCount();
    if (n === 0) return this.LAST_BOTTOM_MARGIN;
    //calculate the distance from top to last rail, which is the last elemeent in railsTop array and add it to the Last fixed bottom margin distance
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

  //It watches your panel’s visibleConnections(), and always returns a sorted copy of that wires list in a stable, unrelated order.
  /*Group wires by the source component (from.partId) in alphabetical order,
   */
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

    const panelEl = this.panelRef?.nativeElement;
    console.log('consttuct',panelEl)
    this.commonService.panelEl.set(panelEl)

    // When railsCount changes, drop parts on removed rails and prune wires/pending.
    //afterViewInit runs only once

    effect(() => {
      const maxRails = this.railsCount(); //current rail count
      const currentParts = this.parts();

      //find kept parts after reducing the rails
      const keptParts = currentParts.filter(p => p.railIndex < maxRails);

      if (keptParts.length !== currentParts.length) {
        this.parts.set(keptParts); //change the parts array when rails is reduced to update the current parts

        const keepIds = new Set(keptParts.map(p => p.id)); //ids of current parts

        const prunedConns = this.connections().filter(
          c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId)
        ); //keep only those wires that has from and to components. removes all other wires

        if (prunedConns.length !== this.connections().length) {
          this.connections.set(prunedConns); //set new connections
        }

        const pending = this.pendingFrom(); //if one component to connect is clicked

        if (pending && !keepIds.has(pending.partId)) {
          this.pendingFrom.set(null); //if the seocnd component is removed, forget the first clicked.
        }

        this.prunePortColors(keepIds); //removed stored colors for wires that are deleted
      }

      this.invalidatePaths(); //clear cache
      // What signals does it react to?
      // this.railsCount()
      // this.parts()
      // this.connections()
      // this.pendingFrom()
      // Any change to these will rerun this block.
    });


    effect(() => {
      const conns = this.connections(); // read current connections after any change in the wire connections
      this.pathCache.clear();
      this.pathEpoch++;    // not used
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


    //dont know if it is ued
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
    if (n === this.railsCount()) return; //If the new value is the same as current rails, do nothing.

    this.railsCount.set(n); //else change railsCount

    if (this.railsCount() == 1) {
      this.totalRailPrice.set(1500)
    }
    else {
      let price = (this.railsCount() - 1) * 750 + 1500
      this.totalRailPrice.set(price)
    }

    // Atomic pruning (parts + wires + pending)
    const keptParts = this.parts().filter(p => p.railIndex < n);
    //Reads the current parts list.Keeps only the components that are placed on valid rails. That is if current number of rail is 3, but before we kept component of rail 4.
    if (keptParts.length !== this.parts().length) {
      //if any components were removed when we reduced or changed rail Number
      this.parts.set(keptParts);//chnaging the parts array
      let price = 0
      this.parts().forEach(element => {
        price += element.price
      });
      this.totalProductPrice.set(price);

      // keepIds is to make a set (unique list) of remaining part IDs.Used to check if a wire is still valid
      const keepIds = new Set(keptParts.map(p => p.id));

      //Keeps only those wires whose from part still exists and to part still exists
      this.connections.set(
        this.connections().filter(
          c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId)
        )
      );

      this.prunePortColors(keepIds); //Removes stored color assignments for ports of deleted parts

      const pending = this.pendingFrom(); //when user clicked on component1 for the first connection points
      if (pending && !keepIds.has(pending.partId)) { //user clicked a connector to start wiring, but that part got removed → cancel pending wiring state
        this.pendingFrom.set(null);
      }
    }
    this.invalidatePaths();
  }


  // Center rails horizontally in the panel container
  //It returns how many pixels from the left side the rails should be placed so they appear perfectly centered in the panel.
  //This function ensures the rail system always stays in the middle, even when the browser is resized.tells from where the rail should start from left

  //getRailLeft() gives the X-coordinate where your rails start, so they are centered in the panel.
  // Example: If panel width is 1000px and rail width is 640px, then:
  // (1000 - 640) / 2 = 180px
  // railLeft = 180
  // → Your rails begin 180px from the left side of screen.

  private getRailLeft(): number {
    const el = this.panelRef?.nativeElement;
    if (!el) return 0; //if panel does not exist, return
    const width = el.clientWidth; //Measures the panel’s current width in pixels.
    return Math.max(0, Math.floor((width - this.RAIL_WIDTH) / 2));
  }



  // =============== Drag from toolbox into panel ==============================
  onStartDragToolbox(pt: PartType, ev: MouseEvent) {
    if (this.locked()) return;

    const panelRect = this.panelRef.nativeElement.getBoundingClientRect();

    // const ghost = document.createElement('div');
    // ghost.className = 'drag-ghost';
    // ghost.style.width = `${pt.w}px`;
    // ghost.style.height = `${pt.h}px`;
    // // ghost.innerHTML = `<span>${pt.label}</span>`;
    // document.body.appendChild(ghost);

    this.isDragging.set(true);
    this.hoverRailIndex.set(null);
    this.preview.set(null);

    //Wile dragging from sidebar to place on the rail
    const onMove = (e: MouseEvent) => {
      // ghost.style.left = `${e.pageX}px`;
      // ghost.style.top = `${e.pageY}px`;
      //e.pageX/Y is the mouse coordinates .Mouse X position inside the full webpage. Ignores scrolling

      const mx = e.clientX, my = e.clientY;
      //clientX is Mouse X position inside the visible browser window (viewport).Ignores scrolling
      const inside =
        mx >= panelRect.left && mx <= panelRect.right &&
        my >= panelRect.top && my <= panelRect.bottom;
      //inside checks if mouse is inside panel area
      if (inside) {
        const relY = my - panelRect.top;
        let railIdx = 0, best = Infinity;
        this.railsTop().forEach((ry, i) => {
          const d = Math.abs(relY - ry); //vertical distance between mouse and that rail
          if (d < best) { best = d; railIdx = i; }
        }); //find the closest rail 

        this.hoverRailIndex.set(railIdx); //set the rail onw which the ghost component needs to be highlighted

        const railLeft = this.getRailLeft();//getRailLeft() tells how many pixels from the left side of the panel the rails start, so that they’re centered horizontally.
        const localXRaw = mx - panelRect.left - railLeft - pt.w / 2;//the X-coordinate (horizontal position) where the system thinks the component would be placed on the rail before any corrections like clamping or snapping are applied.
        const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - pt.w, localXRaw)); //This just makes sure the part does not go outside the rail.
        const snappedX = Math.round(boundedX / this.GRID) * this.GRID;
        //snappedX = “the final X position of the part on this rail, aligned to the grid.”
        this.preview.set({ x: snappedX, w: pt.w, h: pt.h, railIndex: railIdx, images: pt.imagePath }); //This updates your preview ghost while dragging:
      } else {
        this.hoverRailIndex.set(null);
        this.preview.set(null);
        // If the mouse is outside the panel:
        // hoverRailIndex = null → no rail is highlighted.
        // preview = null → hide the ghost.
      }
    };

    //After droppping in the rail
    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const mx = e.clientX, my = e.clientY;
      const inside =
        mx >= panelRect.left && mx <= panelRect.right &&
        my >= panelRect.top && my <= panelRect.bottom;

      //inside checks if component is inside panel
      if (inside) {
        const pv = this.preview(); //if preview (ghost preview) exist
        if (pv) {
          this.placePart(pt, pv.railIndex, pv.x); //place part there by checking collission
        } else {
          //if no preview recalculate nearest rail to drop point
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

      //ghost.remove(); //removing preview. remove is an inbuilt function
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
    const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - pt.w, x)); //boundedX make sure the component stays fully inside the rail horizontally.if too far bind to max lenght of rail and if too low bind to minimum
    const snappedX = Math.round(boundedX / this.GRID) * this.GRID;
    //snappedx Shift the X position to the nearest 5px step so components line up nicely.
    const y = -pt.h / 2; //Place the component so the rail runs through its center.”

    if (this.collides({ x: snappedX, y, w: pt.w, h: pt.h }, railIndex, null)) return;

    const id = crypto.randomUUID(); //id for the part
    const part: PlacedPart = {
      id,
      type: pt.type,
      label: pt.label,
      w: pt.w,
      h: pt.h,
      railIndex,
      x: snappedX,
      y,
      imagePath: pt.imagePath,
      volt: pt.volt,
      price: pt.price,
      disabled: false

    };
    this.parts.update(list => [...list, part]); //list of placed part
    this.totalProductPrice.update(val => val + pt.price)
  }


  //Dragging the part inside the rail
  // =============== Drag inside panel (horizontal-only; can change rail) =====
  onPartMouseDown(e: MouseEvent, partId: string) {
    if (this.locked()) return;
    e.stopPropagation();

    const parts = this.parts();
    const idx = parts.findIndex(p => p.id === partId); //finding current rail index of the part which is getting dragged
    const image = parts.find(p => p.id == partId)?.imagePath;
    if (idx < 0) return;

    const startPart = parts[idx]; //the element which is dragged
    const startX = e.clientX; //x coordinate

    this.isDragging.set(true);
    this.draggingPartId.set(startPart.id);

    const panelRect = this.panelRef.nativeElement.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX; //how much you moved the mouse horizontally (drag distance).

      // Pick nearest rail under the cursor
      const mouseRelY = ev.clientY - panelRect.top;
      let railIdx = 0, best = Infinity;
      this.railsTop().forEach((ry, i) => {
        const d = Math.abs(mouseRelY - ry);
        if (d < best) { best = d; railIdx = i; }
      });
      this.hoverRailIndex.set(railIdx);//finding the nearest rail index

      const candX = startPart.x + dx;
      const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - startPart.w, candX));
      const snappedX = Math.round(boundedX / this.GRID) * this.GRID;
      //calculatign the actual x where it is placed

      const temp = [...this.parts()];
      temp[idx] = { ...startPart, railIndex: railIdx, x: snappedX, y: -startPart.h / 2 };
      this.parts.set(temp); //changing the parts array
      this.preview.set({ x: snappedX, w: startPart.w, h: startPart.h, railIndex: railIdx, images: image ?? '' });

    };

    //after dropping the element same as above
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const now = this.parts()[idx];
      //check if collision. if collides returns to its original position
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
    this.selectedPart = null

    this.connectionFromPartDetails = ''
    this.connectionFromPortDetails = ''
    this.connectionToPartDetails = ''
    this.connectionToPortDetails = ''

    this.parts().forEach(p => {
      p.disabled = false;
    })

     this.pendingFrom.set(null);
    //this.isDesignMode.set(false);
    if (this.locked()) return;

    const yes = window.confirm('Are you sure the design is final? You will not be able to move components.');
    if (yes) this.locked.set(true);

  }

  unfinalizeLayout() {
    this.selectedPart = null 

    this.connectionFromPartDetails = ''
    this.connectionFromPortDetails = ''
    this.connectionToPartDetails = ''
    this.connectionToPortDetails = ''

     this.pendingFrom.set(null);

    this.parts().forEach(p => {
      p.disabled = false;
    })
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
    const top = port === 'top' ? 0 : (p.h - size);


    return {
      left: `${left}px`,
      top: `${top}px`, //top or bottom accordingly
      width: `${size}px`,
      height: `${size}px`,

    };
  }

  //Remembers the first clicked connector (start point). Waits for the second click (end point) . Creates a Connection between those two points. Prevents self-connection (same part → ignored). Picks a color for the wire (based on source port). Clears the pending state after connection

  //call this when a connector is clicked
  onClickConnector(partId: string, port: Port) {

    let newObject;
    const from = this.pendingFrom();//starting connection point
    const here: ConnectorRef = { partId, port };
    this.selectedPart = { id: here.partId, port: port }
    // console.log('from inside clickConnector:',from);
    // console.log('here insdie clickConnector:',here)
    //we get the value always in this 'here'
    console.log('connections:', this.connections())



    //work only on ON FIRST CLICK  
    if (!from) {

      this.connectionFromPartDetails = ''
      this.connectionFromPortDetails = ''
      this.connectionToPartDetails = ''
      this.connectionToPortDetails = ''

      this.pendingFrom.set(here);

      const part1 = this.parts().find(p => p.id == partId);
      this.connectionFromPartDetails = (part1!.label + ' ' + part1!.volt) || ''
      this.connectionFromPortDetails = port[0].toLocaleUpperCase() + port.slice(1,);;
      console.log('from part:', this.connectionFromPartDetails)
      console.log('from port:', this.connectionFromPortDetails)

      this.parts().forEach(p => {
        if (p.id === partId) {
          p.disabled = true;
        }

        this.connections().forEach(c => {
          if (p.id != partId && ((p.id == c.to.partId && partId == c.from.partId) || (p.id == c.from.partId && partId == c.to.partId))) {
            p.disabled = true;
          }
        })
      })
      return;
    }

    //work only on second click(disabling)
    if (from) {
      this.selectedPart = null;
      const part2 = this.parts().find(p => p.id == partId);
      if (from.partId == here.partId) {
        this.pendingFrom.set(null);
        return
      }
      this.parts().forEach(p => {
        p.disabled = false;
      })
      console.log('second click')
      this.connectionToPartDetails = (part2!.label + ' ' + part2!.volt) || ''
      this.connectionToPortDetails = port[0].toLocaleUpperCase() + port.slice(1,);

    }

    // No self-connection
    if (from.partId === here.partId) {
      console.log('no connection self')
      this.pendingFrom.set(null);
      return;
    }

    //rule
    if (from.partId && here.partId) {
      // const foundFromPartId = this.newArrayofConnections().find(obj => obj.fromPartId === from.partId);
      // const foundToPartId = this.newArrayofConnections().find(obj=> obj.toPartId == here.partId);
      // const foundFromPartId = this.newArrayofConnections().find(obj => obj.fromPartId === from.partId || obj.fromPartId == here.partId);
      // const foundToPartId = this.newArrayofConnections().find(obj=> (obj.toPartId == here.partId || obj.toPartId == from.partId) && (obj.toPartId!=foundFromPartId?.fromPartId));

      // console.log('foudnFromPart:',foundFromPartId?.fromPartId); //INITIALLY EMPTY SINCE NO WIRES ARE ADDED
      //console.log('foudnFromPort:',foundFromPort);
      // console.log('foudntoPartId:',foundToPartId?.toPartId); //INITIALLY EMPTY SINCE NO WIRES ARE ADDED

      const checkExisting = this.newArrayofConnections().find(obj => (obj.fromPartId == from.partId && obj.toPartId == here.partId) || (obj.fromPartId == here.partId && obj.toPartId == from.partId))

      console.log('checkExsitingh:', checkExisting);

      if (checkExisting) {
        console.log('no connection RULE')
        this.pendingFrom.set(null);
        console.log('newconnection:', this.newArrayofConnections())
        return;
      }
      // foundObject will be { id: 2, name: 'Beta' } or undefined if not found;
      console.log('newconnection:', this.newArrayofConnections())
    }

    const color = this.getOrAssignColor(from.partId, from.port);
    const conn: Connection = {
      id: crypto.randomUUID(),
      from,
      to: here, //second connection point
      color,
      manual: false
    };

    //set the connection id
    this.connections.update(list => [...list, conn]);

    newObject = {
      fromPartId: from.partId,
      fromPartConnector: from.port,
      toPartId: here.partId,
      toPartConnector: here.port,
      connectionId: conn.id
    };

    this.newArrayofConnections.update(prev => [...prev, newObject]);

    this.pendingFrom.set(null); //next connection
  }


  // Only X-axis overlap matters because all boxes are centered vertically on the rail
  //collides() checks whether a new component you are trying to place overlaps (collides) horizontally with any existing component on the same rail.
  private collides(r: { x: number; y: number; w: number; h: number }, railIndex: number, ignoreId: string | null): boolean {
    const list = this.parts().filter(p => p.railIndex === railIndex && p.id !== ignoreId);
    return list.some(p => r.x < p.x + p.w && r.x + r.w > p.x);
    //returns a boolean to check if collisoin occurs
  }

  railStyle(i: number) {
    return {
      left: `${this.getRailLeft()}px`,
      width: `${this.RAIL_WIDTH}px`,
      top: `${this.railsTop()[i]}px`,
      height: `${this.RAIL_BLOCK_THICK}px`,

      // backgroundImage: `url(${'assets/DIN-Rail.png'})`,
      // backgroundSize: '100% 100%',  // MAKES IMAGE MATCH DIV WIDTH & HEIGHT
      // backgroundRepeat: 'no-repeat',
      // backgroundPosition:'center',
      //width:`${640}px`,

      // backgroundSize: 'cover',
      // backgroundRepeat: 'no-repeat',
      // backgroundPosition: 'center',
    };
  }

  //specifies height to panel
  panelStyle() {
    return { height: `${this.panelHeight()}px` };
  }

  //When you click anywhere on the empty panel area (not on connectors, not on components), this function is executed: If you clicked one connector (first click of wiring) But changed your mind or misclicked. Clicking the empty panel cancels the wire creation
  onPanelClick() {
    //to unselect the connections
    this.connectionFromPartDetails = ''
    this.connectionFromPortDetails = ''
    this.connectionToPartDetails = ''
    this.connectionToPortDetails = ''
    this.selectedPart = null

    this.parts().forEach(p => {
      p.disabled = false
    })
    if (this.pendingFrom()) this.pendingFrom.set(null);
  }

  // ======================= ORTHOGONAL ROUTER ================================

  /** Build absolute panel-space rect for a part (including rail offset + centering) */
  //It computes the exact X, Y, width, and height of a component/elemenet in the SVG/panel space.
  private partRectAbs(p: PlacedPart): Rect {
    const railLeft = this.getRailLeft();//This gets the X position where rails start on the panel (centered).
    const railY = this.railsTop()[p.railIndex]; //railsTop() gives the Y positions of given rail
    return { x: railLeft + p.x, y: railY - p.h / 2, w: p.w, h: p.h };
    //{ x:730, y:370, w:100, h:60 } x is the starting position of the element from the rail and y is the starting position of the element from y and w and h is the width and height of the element
  }

  /** Connector center in panel coords (inside edge center) */
  //It returns the exact pixel position (x, y) of a connector knob (top or bottom) in absolute panel coordinates, so the wire router knows: where a connection startswhere a connection ends

  //ref can be part from or part to
  private connectorCenter(ref: ConnectorRef): Pt | null {
    const p = this.parts().find(q => q.id === ref.partId);//find the part
    if (!p) return null;
    const r = this.partRectAbs(p); //find the recatangle of part
    const size = this.CONNECTOR_SIZE;
    //Now locating connector center:(division is executed first)
    if (ref.port === 'top') {
      return { x: r.x + r.w / 2, y: r.y + size / 2 };
    } else {
      return { x: r.x + r.w / 2, y: r.y + r.h - size / 2 };
    }
  }

  //When a user clicks a wire, this function converts it from auto-routed to manual (by saving the current path as editable points), highlights it as the selected wire, and prepares it for dragging/editing.
  onSelectConnection(conn: Connection, ev: MouseEvent) {
    ev.stopPropagation();
    //conn returns connection lines
    //conn.manual is set to true when we click
    // If not manual, lock in the current auto-routed path as template
    //?? dont know when it goes inside if block
    if (!conn.manual) {

      const auto = this.pathCache.get(conn.id);
      if (auto && auto.length >= 2) {
        conn.manual = true;
        conn.manualPoints = auto.map(p => ({ x: p.x, y: p.y }));
        this.connections.set([...this.connections()]); // trigger signal update
      }
    }

    this.editingConnId.set(conn.id);//set the connection wire which is now manually handled
  }

  //onHandleDown() lets the user drag an individual point of a manual wire, snapping it to grid and updating the wire’s polyline  until the mouse is released
  //   onHandleDown(connId: string, index: number, ev: MouseEvent) {
  //     ev.stopPropagation();
  //     this.dragHandle.set({ connId, index });
  //     console.log('inside handledown')
  //     const move = (e: MouseEvent) => {
  //       const handle = this.dragHandle();
  //       if (!handle) return;

  //       const conns = this.connections();
  //       const conn = conns.find(x => x.id === handle.connId);
  //       if (!conn || !conn.manual || !conn.manualPoints) return;

  //       // Snap movement to grid
  //       const x = Math.round(e.offsetX / this.ROUTE_STEP) * this.ROUTE_STEP;
  //       const y = Math.round(e.offsetY / this.ROUTE_STEP) * this.ROUTE_STEP;

  //       conn.manualPoints[handle.index] = { x, y };
  //       this.connections.set([...conns]); // trigger redraw
  //     };

  //     const up = () => {
  //       this.dragHandle.set(null);
  //       document.removeEventListener('mousemove', move);
  //       document.removeEventListener('mouseup', up);
  //     };

  //     document.addEventListener('mousemove', move);
  //     document.addEventListener('mouseup', up);
  // }


  //onWireMouseDown() lets the user drag the entire wire by converting it to a manual path if needed and then shifting all its polyline points as the mouse moves
  onWireMouseDown(conn: Connection, ev: MouseEvent) {
    ev.stopPropagation();

    // Ensure we have a manual template path ??dont know why
    //Take the current auto-generated path as the starting shape for manual editing.
    if (!conn.manual || !conn.manualPoints || conn.manualPoints.length < 2) {
      const auto = this.pathCache.get(conn.id);//already built automatic connection point

      if (auto && auto.length >= 2) {
        conn.manual = true;
        conn.manualPoints = auto.map(p => ({ x: p.x, y: p.y }));

      } else {
        return; // nothing to drag
      }
    }
    this.editingConnId.set(conn.id); //“User is currently editing this specific wire.”


    const startX = ev.clientX; //startX, startY = mouse position at the moment you first click on the wire.
    const startY = ev.clientY;
    const original = conn.manualPoints!.map(p => ({ x: p.x, y: p.y })); //before moving value x,y values of wires


    //EXECUTES CONSTANTLY WHEN WE MOVE WIRE
    const move = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;


      //set the conn.manualPoints AFTER CHANGING MANUALLY
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

    document.addEventListener('mousemove', move); //FIRES WHEN WE DRAG A WIRE
    document.addEventListener('mouseup', up);
  }



  //getPolylinePoints is executed whenever a small change  in line occurs. we  pass each wire to it 
  //getPolylinePoints() returns the exact polyline path for a wire—either using the user’s manual shape or automatically routing a new clean orthogonal path around obstacles.
  getPolylinePoints(conn: Connection): string {
    // 1) MANUAL MODE: endpoints fixed, interior can stretch, all segments orthogonal
    if (conn.manual && conn.manualPoints && conn.manualPoints.length >= 2) {
      const start = this.connectorCenter(conn.from);  //center point of connector from which wire starts
      const end = this.connectorCenter(conn.to); //finding the center point of connector where wire ends
      if (!start || !end) return '';

      const raw = conn.manualPoints; //get the current manualPoints


      // interior template (everything except endpoints(start and end) of the template)
      let interior: Pt[] = [];

      if (raw.length > 2) {
        interior = raw.slice(1, raw.length - 1).map(p => ({ x: p.x, y: p.y }));
        //get all points except interior points

        // Orientation of the first template segment (still orthogonal even after translation)
        const startVertical = raw[1].x === raw[0].x; //get starting vertical x which is always same(if different lines are horizontal)
        if (interior.length >= 1) {
          if (startVertical) {
            // first segment vertical → share x with start
            interior[0].x = start.x;//adjust the starting of the wire such that it starts at the center of the connector
          } else {
            // first segment horizontal → share y with start
            interior[0].y = start.y; ///adjust the starting of the wire such that it starts at the center of the connector
          }
        }

        // Orientation of the last template segment
        //similarly adjust the ending too to coincide with the center of connector
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

      const pts: Pt[] = [start, ...interior, end]; //collection of points

      return pts
        .map(p => `${Math.round(p.x)},${Math.round(p.y)}`)
        .join(' ');
      //adjusting the points 
    }



    // 2) AUTO MODE (unchanged – your current routing logic)
    const cached = this.pathCache.get(conn.id); //if path already cached get the path in the if block

    if (cached) {
      return cached.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    }
    //If nothing is cached, we continue and compute the route from scratch.
    const a = this.connectorCenter(conn.from); //center point of connector where wire starts
    const b = this.connectorCenter(conn.to); //finding the center point of connector where wire ends
    if (!a || !b) return '';

    const snap = (n: number, step = this.ROUTE_STEP) =>
      Math.round(n / step) * step; //It rounds a number (n) to the nearest multiple of ROUTE_STEP.it rounds 23 to 20 , 27 to 30 etc

    //.ROUTE_STEP - The wire can only route and bend at multiples of this pixel step (up/down/left/right jumps follow this distance). example ROUTE_STEP = 10
    //Then routing points become: 0, 10, 20, 30, 40, 50… (only these marks) . If you try to bend at 37px, it becomes: snap(37/10)=4 → 4*10=40 ✅ (bends at 40px)

    const stubLen = Math.max(
      this.ROUTE_STEP,
      Math.ceil(this.STUB_LEN / this.ROUTE_STEP) * this.ROUTE_STEP
    ); //minimum vertical line that starts from the connector. it should be minimum value of route step

    const aGrid = { x: snap(a.x), y: snap(a.y) }; //round the value of a to agrid by snapping (first point)
    const bGrid = { x: snap(b.x), y: snap(b.y) }; //rounding the value of b to bgrid by snapping (last point)

    const aStub = {
      x: aGrid.x,  //second x point
      y:
        conn.from.port === 'top'
          ? snap(aGrid.y - stubLen) //we reduce since y axis decreases as we go up the screen
          : snap(aGrid.y + stubLen),
    };
    const bStub = { //secondlast point
      x: bGrid.x,
      y:
        conn.to.port === 'top'
          ? snap(bGrid.y - stubLen)
          : snap(bGrid.y + stubLen),
    };

    //It decides how much the wire should shift left/right when multiple wires connect to the same connector, so they don’t overlap.
    const laneOffset = (ref: ConnectorRef) => {
      const { index, total } = this.portSlot(ref, conn.id);
      //index is the order of wire, total is the total number of wires connected to that element eg:total 3, index  =0
      if (total <= 1) return 0;
      const center = (total - 1) / 2; //eg 3-1/2 = 1
      const rawOff = (index - center) * this.FANOUT_GAP; //calculating the position of wire (0-1*15 = -15 px ; 1-1*15 = 0; 2-1*15=15)
      return snap(rawOff);
    };

    const toDx = laneOffset(conn.to); //finding the x position of wire to the panel it is going to get connected

    const bStubOff = { x: snap(bStub.x + toDx), y: bStub.y }; //changing the x axis of the ending wire based on the adjusted position

    const startStubDir = conn.from.port === 'top' ? -1 : +1; //These tell the router which way the stub is facing:Wire comes upwards from the connector
    const endStubDir = conn.to.port === 'top' ? -1 : +1; //-1 wire comes upwards the connector. +1 wire goes downwards the connector

    const aAnchor = { x: aStub.x, y: aStub.y }; //starting point of pathfinding (A* search) after the connector stubs.(aStub is the second point)
    const bAnchor = { x: bStubOff.x, y: bStubOff.y }; // second last ending  point 

    const cellRect = (cx: number, cy: number): Rect => {
      const s = this.ROUTE_STEP;
      return { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
    };

    // const startGuard = cellRect(
    //   aAnchor.x,
    //   aAnchor.y - startStubDir * this.ROUTE_STEP
    // );

    //this creates a block just before the connector so that it does not take a weird pathbefore it reaches the second last path
    const endGuard = cellRect(
      bAnchor.x, //second last ending point
      bAnchor.y - endStubDir * this.ROUTE_STEP //
    );

    //total usable width of panel for routing
    const width =
      this.panelRef.nativeElement.clientWidth ||
      this.getRailLeft() + this.RAIL_WIDTH * 2;


    const height = this.panelHeight();//total height of panel for routing

    const fromPart = this.parts().find(q => q.id === conn.from.partId)!; //part from which connection starts

    const toPart = this.parts().find(q => q.id === conn.to.partId)!; //part from which connection ends

    const crossRail = fromPart.railIndex !== toPart.railIndex  // (if they're on different rails set true)

    //It finds which component is higher (top-side) on the panel by comparing their Y positions
    const upper =
      this.railsTop()[fromPart.railIndex] <
        this.railsTop()[toPart.railIndex]
        ? fromPart
        : toPart;

    const lower = upper === fromPart ? toPart : fromPart; //finnd the lower component

    //Check if the wire is going exactly from the top of the lower part to the bottom of the upper part for 180degreee line
    const portsAreTopOfLower_to_BottomOfUpper =
      (conn.from.partId === lower.id &&
        conn.from.port === 'top' &&
        conn.to.partId === upper.id &&
        conn.to.port === 'bottom')
      ||
      (conn.to.partId === lower.id &&
        conn.to.port === 'top' &&
        conn.from.partId === upper.id &&
        conn.from.port === 'bottom');

    //for drawing perfect 190 degree line   
    const allowDirectVertical =
      crossRail &&
      this.verticallyAligned(fromPart, toPart) &&
      portsAreTopOfLower_to_BottomOfUpper;

    let preferredSide: 'left' | 'right' | null = null; //of from part

    //if crossRail but are not vertical check if it close to left side or right side
    if (crossRail && !allowDirectVertical) {
      if (this.isLeftmostOnRail(fromPart)) preferredSide = 'left';
      else if (this.isRightmostOnRail(fromPart)) preferredSide = 'right';
    }

    const railLeft = this.getRailLeft(); //start if rail in left side
    const railRight = railLeft + this.RAIL_WIDTH; //end of rail in right side

    //inflate each part by 5px 
    const partRects = this.parts().map(p =>
      this.inflate(this.partRectAbs(p), this.OBSTACLE_CLEAR)
    );

    const railsRects: Rect[] = [];

    //Treat the rail line as an obstacle. Do not route wires through it.”
    for (const y of this.railsTop()) {
      if (allowDirectVertical) {
        const minY = Math.min(aStub.y, bStub.y); //finds the second point and second last point y coordinate in min and max
        const maxY = Math.max(aStub.y, bStub.y);///finds the second point and second last point y coordinate in min and max
        if (y >= minY && y <= maxY) continue; //if straight lines are allowe,  If a rail lies between those two Y positions, skip blocking it, because we want the wire to pass straight through.
      }
      //if lines are not verticallly aligned then we need to skip rails . So to avoid that, we create fake invisible rectangles (bars) covering each rail, to block routing:
      railsRects.push({
        x: railLeft,
        y: y - this.RAIL_BLOCK_THICK / 2,
        w: this.RAIL_WIDTH,
        h: this.RAIL_BLOCK_THICK,
      });
    }

    const sideWalls: Rect[] = [];

    if (preferredSide) { //we check preferredside of from part
      const minY = Math.min(aStub.y, bStub.y);//finds the second point and second last point y coordinate in min and max
      const maxY = Math.max(aStub.y, bStub.y);///finds the second point and second last point y coordinate in min and max
      if (preferredSide === 'left') {
        //Place a blocking wall on the RIGHT side
        sideWalls.push({
          x: railRight,
          y: minY,
          w: Math.max(
            1,
            this.panelRef.nativeElement.clientWidth - railRight //cover everything to the right
          ),
          h: maxY - minY,
        });
      } else {
        // //Place a blocking wall on the LEFT side
        sideWalls.push({
          x: 0,
          y: minY,
          w: Math.max(1, railLeft),
          h: maxY - minY,
        });
      }
    }

    //obstacles for the part
    const obstacles: Rect[] = [
      ...partRects,//INFLATED PART
      ...railsRects, // rail obstacle
      ...sideWalls, //side wall
      endGuard, //this creates a block just before the connector so that it does not take a weird pathbefore it reaches the second last path
    ];

    const routed = this.routeOrthogonal(
      aAnchor,//second point
      bAnchor, // second last point
      obstacles, //lis of obstacles
      { w: width, h: height }, //width and height of panel
      this.ROUTE_STEP //grid
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
    //const pts: Pt[] = [aGrid, aStub, ...routed, bStubOff, bGrid];
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
  //routeOrthogonal() uses A* pathfinding to compute a clean orthogonal (90°) wire route between two points, avoiding obstacles and minimizing turns.
  //Finds a path of 90° lines from start to goal,staying inside the panel, and avoiding all rectangles in obstacles.

  private routeOrthogonal(start: Pt, goal: Pt, obstacles: Rect[], bounds: { w: number; h: number }, step: number): Pt[] {
    // Convert points to grid
    /*GRID is like the marking lines on a construction blueprint.
      You don’t place components anywhere randomly – you only put them at fixed clean intervals so wiring stays readable and routing is fast. */
    const toCell = (p: Pt) => ({ cx: Math.round(p.x / step), cy: Math.round(p.y / step) });
    const toPoint = (c: { cx: number; cy: number }): Pt => ({ x: c.cx * step, y: c.cy * step });

    const cols = Math.ceil(bounds.w / step); //divide the entire space into columns and then we check for each grid if line can pass through it or not (121)
    const rows = Math.ceil(bounds.h / step); //divide the entire space into rows and then we check for each grid if line can pass through it or not (85)


    // Build blocked grid
    const blocked = new Uint8Array(cols * rows); //(10,285)
    /*It creates a flat table (array) of grid cells, where each cell stores:
    0 = free (wire can pass ✅)
    1 = blocked (occupied by a part or obstacle ❌) */
    //marks grid cells as blocked (1) if a rectangle (component/obstacle) sits on top of those grid squares.

    const markRect = (r: Rect) => {
      const x0 = Math.max(0, Math.floor(r.x / step)); //get the top-left corner of rectangle r
      const y0 = Math.max(0, Math.floor(r.y / step)); //get the top-left corner of rectangle r
      const x1 = Math.min(cols - 1, Math.ceil((r.x + r.w) / step)); //  bottom-right corner of rectangle r
      const y1 = Math.min(rows - 1, Math.ceil((r.y + r.h) / step)); // bottom-right corner of rectangle r
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          blocked[cy * cols + cx] = 1; //if cell is blocked marked as 1
        }
      }
    };

    obstacles.forEach(markRect); //Run the markRect function on every rectangle in the obstacles list and block the grid cells they occupy

    //toCell() converts pixel → nearest grid intersection in cell numbers
    /*
      start = { x: 300, y: 150 }
      goal  = { x: 700, y: 450 }
      step = 20 px

      s = { cx: round(300/20) = 15,  cy: round(150/20) = 8  }

      g = { cx: round(700/20) = 35,  cy: round(450/20) = 23 }

      “I need a path from grid cell (15,8) → (35,23)”
      t will move only in cell steps like:
      Right → Right → Right → Down → Down → Left → … until goal
      Every movement is exactly 20px apart, so the line stays clean at 90°/180°.
    */
    const s = toCell(start);
    const g = toCell(goal);
    //console.log('grids of start and end:', s, g)

    const inBounds = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows; //checks if a grid cell is inside the panel It makes sure the router does not go outside your panel area.
    const passable = (cx: number, cy: number) => inBounds(cx, cy) && !blocked[cy * cols + cx]; //– checks if the grid cell is inside AND not blocked

    // If start/goal land on blocked, try nudging a few cells (rare)
    //If the start or end (goal) point falls inside an obstacle (a blocked grid), nudge() tries to push it into the nearest free grid cell.ex
    const nudge = (c: { cx: number; cy: number }) => {
      if (passable(c.cx, c.cy)) return c;  //Checks is passable, If not blocked → return same cell ✅
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
      for (const [dx, dy] of dirs) {
        const nx = c.cx + dx, ny = c.cy + dy;
        if (passable(nx, ny)) return { cx: nx, cy: ny };
      }
      return c;
      /*If blocked, try nearby directions [1 cell left/right/up/down...]
      If one of them is free → return that one ✅
      If none free → return original (then router uses fallback later) */
    };

    const S = nudge(s);
    const G = nudge(g);


    // A* with 4 neighbors (orthogonal)
    /*How far is the current grid cell from the destination cell?”
    But it measures distance in a Manhattan way (straight + 90° turns only), not diagonal.
    h = |current X - destination X|  +  |current Y - destination Y| */
    const h = (cx: number, cy: number) => Math.abs(cx - G.cx) + Math.abs(cy - G.cy);
    const open: number[] = []; //This is a list of grid cells to be checked for a valid wire path.open = [ 45, 65, 85 ]
    //Means: A* will check cell 45 first, then 65, then 85 (based on lowest fScore order).
    const gScore = new Map<number, number>(); /*How far the wire has already traveled to reach a cell.”
It remembers the actual cost from start → this cell.
Example:Cell 45 → gScore = 5  (5 steps from start)Cell 65 → gScore = 9 */
    const fScore = new Map<number, number>(); /*gScore + estimated remaining distance (heuristic)”.This is used to pick the best next move. */
    const cameFrom = new Map<number, number>();/*4️⃣ cameFrom = new Map<number, number>()
Stores the parent cell from where we reached this cell so the path can be reconstructed later.
Example:45 was reached from 30 → cameFrom.set(45,30).65 was reached from 45 → cameFrom.set(65,45).30->45->65 */

    /* const key. This converts a 2D grid cell (column X, row Y) into a single unique number index.
    Why?Because A* stores everything using 1 number per cell, not (x,y) pairs.
    What is cols? Number of columns in the grid = panelWidth ÷ step size */
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
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
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
    if (this.locked()) return;  // disable after finalize. Cannot delete if layout is locked
    const price = this.parts().find(p => p.id == partId)?.price
    //remaining parts after filtering the part that has to be deleted
    const remainingParts = this.parts().filter(p => p.id !== partId);

    if (remainingParts.length === this.parts().length) return;

    //set parts to remaining parts
    this.parts.set(remainingParts);

    const remainingConnections = this.newArrayofConnections().filter(p => (p.fromPartId != partId) || (p.toPartId != partId))
    this.newArrayofConnections.set(remainingConnections)
    // remove any wires referencing this part
    const keepIds = new Set(remainingParts.map(p => p.id)); //ids of remaining parts

    this.connections.set(
      this.connections().filter(c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId))
    ); //filter only the required connection

    //remove the colors
    this.portColors.delete(this.portKey(partId, 'top'));
    this.portColors.delete(this.portKey(partId, 'bottom'));
    //console.log('remaining',remainingParts)
    this.totalProductPrice.update(val => val - (price ?? 0))
    // clear pending if it referenced this part
    const pending = this.pendingFrom();
    if (pending && pending.partId === partId) this.pendingFrom.set(null);

    this.invalidatePaths();
  }

  //to delete a connection line
  onDeleteConnection(connId: string, ev?: MouseEvent) {
    ev?.stopPropagation();
    if (this.locked()) return;  // disable after finalize. cannot delete connection if layout is locked

    this.connections.set(this.connections().filter(c => c.id !== connId)); //filter the connection by removing that connection;
    const remainingConnections = this.newArrayofConnections().filter(p => p.connectionId != connId)
    this.newArrayofConnections.set(remainingConnections)
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
  // private getOrAssignColor(partId: string, port: Port): string {
  //   const key = this.portKey(partId, port);
  //   const existing = this.portColors.get(key);
  //   if (existing) return existing;

  //   // Avoid colors already used by any other port, and avoid sibling port color
  //   const used = new Set(this.portColors.values());
  //   const sibling = this.portColors.get(this.portKey(partId, port === 'top' ? 'bottom' : 'top'));

  //   let chosen: string | null = null;
  //   // try a full pass over the palette starting at colorIndex
  //   for (let i = 0; i < this.colorCycle.length * 2; i++) {
  //     const idx = (this.colorIndex + i) % this.colorCycle.length;
  //     const c = this.colorCycle[idx];
  //     if (!used.has(c) && c !== sibling) {
  //       chosen = c;
  //       this.colorIndex = idx + 1; // advance index only when we pick
  //       break;
  //     }
  //   }
  //   // Fallback: still avoid sibling if possible
  //   if (!chosen) {
  //     for (let i = 0; i < this.colorCycle.length; i++) {
  //       const c = this.colorCycle[i];
  //       if (c !== sibling) { chosen = c; this.colorIndex = i + 1; break; }
  //     }
  //   }
  //   // Last resort: just pick next (palette exhausted)
  //   if (!chosen) {
  //     chosen = this.colorCycle[this.colorIndex % this.colorCycle.length];
  //     this.colorIndex++;
  //   }

  //   this.portColors.set(key, chosen);
  //   return chosen;
  // }
  private getOrAssignColor(partId: string, port: Port): string {
    const key = this.portKey(partId, port);//  "mcb_123:top / partid:port"
    const existing = this.portColors.get(key);//same port of a connector gets a different color
    if (existing) return existing;

    const siblingKey = this.portKey(partId, port === 'top' ? 'bottom' : 'top');
    const sibling = this.portColors.get(siblingKey);
    //We read the sibling’s color so we can avoid giving that same color here.
    //if top is current port, then bottom port is sibling

    let chosen: string | null = null;

    // 1) Try to pick a color from the fixed palette that:
    //    - has NEVER been used before globally
    //    - is not the same as the sibling port color
    for (let i = 0; i < this.colorCycle.length; i++) {
      const idx = (this.colorIndex + i) % this.colorCycle.length;
      const c = this.colorCycle[idx];

      if (!this.usedColors.has(c) && c !== sibling) {
        chosen = c; //if color is not used and is not sibling color
        this.colorIndex = idx + 1;   // advance pointer (??? %lenght)
        break;
      }
    }

    // 2) If palette is exhausted, generate new unique colors on the fly
    //create new color
    if (!chosen) {
      // Use golden-angle trick for nice distribution of hues
      //no need colorIndex to set to begining since from here on we need only new colors
      const hue = (this.colorIndex * 137) % 360;
      chosen = `hsl(${hue}, 85%, 40%)`;
      this.colorIndex++;
    }

    // Mark this color as permanently used and bind it to this port
    this.usedColors.add(chosen); //add this to usedColors
    this.portColors.set(key, chosen); // add 
    return chosen;
  }


  // Remove color entries for parts that no longer exist
  //portColors has this key value pair
  //key: "552a6e27-b916-4018-a7c7-0df4646d5107:bottom"
  //value: "#eb0d0dff"
  private prunePortColors(keepIds: Set<string>) {
    for (const k of Array.from(this.portColors.keys())) {
      const [pid] = k.split(':', 1); //get the component id
      if (!keepIds.has(pid)) {
        //if the component does not exist
        this.portColors.delete(k) //delete that key which deletes the value also
      };
    }
  }





}