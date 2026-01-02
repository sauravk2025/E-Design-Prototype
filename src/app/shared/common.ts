import { computed, effect, Injectable, signal } from '@angular/core';
import { Connection, ConnectorRef, PlacedPart, Port, Pt } from './interfaces';
import { RAIL_WIDTH, RAIL_SPACING} from './constants';
@Injectable({
  providedIn: 'root',
})
export class Common {
  
  panelEl = signal<any>('');
  locked = signal<boolean>(false); //locked() == true after we click finalise layout
  isDragging = signal<boolean>(false); //check if user is dragging
  hoverRailIndex = signal<number | null>(null);//The index of the rail that the mouse is currently hovering over.used in dragging
  preview = signal<{ x: number; w: number; h: number; railIndex: number; images: string } | null>(null); //A fake “ghost component” drawn under the mouse while dragging from toolbox or dragging on panel.
  railsCount = signal<number>(1); //number of rails
  parts = signal<PlacedPart[]>([]); //The array of all components placed on the panel.
  totalProductPrice = signal<number>(0)
  selectedPart = signal<{ id: string, port: string } | null>(null);
  connectionFromPartDetails = signal<string>('')
  connectionFromPortDetails = signal<string>('')
  connectionToPartDetails = signal<string>('')
  connectionToPortDetails = signal<string>('')
  totalRailPrice = signal<number>(1500);
  pathCache = new Map<string, Pt[]>();   // pathCache stores the auto-routed polyline points (Pt[]) for each connection, indexed by the connection ID.
  pendingFrom = signal<ConnectorRef | null>(null); //The connector the user clicked first before drawing a wire.
  connections = signal<Connection[]>([]); //All the wires drawn between components.
  errorIndex = signal<number>(-1)
  portPosition = signal<string>('')
  portColors = new Map<string, string>();
  RAIL_WIDTH= RAIL_WIDTH;
  RAIL_SPACING=RAIL_SPACING;
  newArrayofConnections = signal<{ fromPartId: string, fromPartConnector: string, toPartId: string, toPartConnector: string, connectionId: string }[] | []>([])
  
  isDeleted = signal<boolean>(false)
  deletePartId = signal<string>('')
  deletePartMouseEvent:MouseEvent|undefined = undefined;
  deletedPartItem = signal<PlacedPart|null>(null);

  startDownload = signal<boolean>(false)
  lastIndex =signal<number>(0);

  pdfTable = signal<any>('');

  externalSource:PlacedPart= {
        id:crypto.randomUUID(),
        type:'externalSource',
        label:'External Power Source',
        w: 100,
        h: 130,
        railIndex:1,
        x: 70,
        y: 300,
        imagePath: 'assets/externalSource5.png',
        volt: '',
        price: 100,
        disabled: false,
        phase:3,
        phasePositionTop:'',
        phasePositionBottom:'',
        isFixed:true

      };

  constructor(){
    this.parts.update((p)=>[...p,this.externalSource])
  }


  railsTop = computed(() =>
    Array.from({ length: this.railsCount()+1}, (_, i) => (i + 1) * this.RAIL_SPACING)
  );
  
  
  // Center rails horizontally in the panel container
  //It returns how many pixels from the left side the rails should be placed so they appear perfectly centered in the panel.
  //This function ensures the rail system always stays in the middle, even when the browser is resized.tells from where the rail should start from left
  getRailLeft(): number {
    const el = this.panelEl();
    if (!el) return 0; //if panel does not exist, return
    const width = el.clientWidth; //Measures the panel’s current width in pixels.
    return Math.max(0, Math.floor((width - this.RAIL_WIDTH) / 2));
  }

 collides(r: { x: number; y: number; w: number; h: number }, railIndex: number, ignoreId: string | null): boolean {
  const list = this.parts().filter(p => p.railIndex === railIndex && p.id !== ignoreId);
  return list.some(p => r.x < p.x + p.w && r.x + r.w > p.x);
    //returns a boolean to check if collisoin occurs
  }

  
 invalidatePaths() {
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


  // Remove color entries for parts that no longer exist
  //portColors has this key value pair
  //key: "552a6e27-b916-4018-a7c7-0df4646d5107:bottom"
  //value: "#eb0d0dff"
  prunePortColors(keepIds: Set<string>) {
    for (const k of Array.from(this.portColors.keys())) {
      const [pid] = k.split(':', 1); //get the component id
      if (!keepIds.has(pid)) {
        //if the component does not exist
        this.portColors.delete(k) //delete that key which deletes the value also
      };
    }
  }

  
  /*It creates a unique key string for a connector port.
  Example:
  portKey("mcb_123", "top")  →  "mcb_123:top"
  portKey("rcd_55", "bottom") → "rcd_55:bottom" */

    portKey(partId: string, port: Port) {
      return `${partId}:${port}`;
    }
  
  deleteComponent(){
    if(this.deletePartId() && this.deletePartMouseEvent){
     
       this.deletePartMouseEvent ?.stopPropagation();
      if (this.locked()) return;  // disable after finalize. Cannot delete if layout is locked
      const price = this.parts().find(p => p.id == this.deletePartId() )?.price
      //remaining parts after filtering the part that has to be deleted
      const remainingParts = this.parts().filter(p => p.id !== this.deletePartId() );
  
      if (remainingParts.length === this.parts().length) return;
  
      //set parts to remaining parts
      this.parts.set(remainingParts);
  
      const remainingConnections = this.newArrayofConnections().filter(p => (p.fromPartId != this.deletePartId() ) || (p.toPartId != this.deletePartId() ))
      this.newArrayofConnections.set(remainingConnections)
      // remove any wires referencing this part
      const keepIds = new Set(remainingParts.map(p => p.id)); //ids of remaining parts
  
      this.connections.set(
        this.connections().filter(c => keepIds.has(c.from.partId) && keepIds.has(c.to.partId))
      ); //filter only the required connection
  
      //remove the colors
      this.portColors.delete(this.portKey(this.deletePartId() , 'top'));
      this.portColors.delete(this.portKey(this.deletePartId() , 'bottom'));
   
      this.totalProductPrice.update(val => val - (price ?? 0))
      // clear pending if it referenced this part
      const pending = this.pendingFrom();
      if (pending && pending.partId === this.deletePartId() ) this.pendingFrom.set(null);
  
      this.invalidatePaths();
    }
    this.deletePartId.set('');
    this.deletePartMouseEvent = undefined;
    this.deletedPartItem.set(null)
    this.isDeleted.set(false)
  }

  deletePart(partId: string, ev?: MouseEvent){
   
    this.deletePartId.set(partId);
    const deletedPart = this.parts().find(p=>p.id==partId)
    this.deletedPartItem.set(deletedPart!)
    this.deletePartMouseEvent = ev;
  }

}
