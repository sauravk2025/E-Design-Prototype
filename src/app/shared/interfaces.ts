
export type Port = 'top' | 'bottom'; //decide between top and bottom ports


export interface Pt { x: number; y: number; } //defines a single point

export interface Rect { x: number; y: number; w: number; h: number; }

export interface PartType {
  type: string;
  label: string;
  volt: string,
  w: number;
  h: number;
  imagePath: string;
  description: string;
  price: number;
  part_number: string;
  phase:number
  

} //for each component


//after placing each part in a rail
export interface PlacedPart {
  id: string;
  type: string;
  label: string;
  w: number;
  h: number;
  railIndex: number; // 0..N-1
  x: number;         // left within rail (0..RAIL_WIDTH-w)
  y: number;         // always -h/2 so the rail passes through center
  imagePath: string,
  volt: string,
  price: number,
  disabled: boolean
  phase : number
  phasePositionTop:string;
  phasePositionBottom:string;
  isFixed:boolean;
  tagName:string
}

export interface ConnectorRef {
  partId: string; //id of the component
  port: Port; //port
}

export interface Connection {
  id: string; //id of wire (Actually created using crypto.randomUUID().)
  from: ConnectorRef; //from connected component
  to: ConnectorRef; //to conncted component
  color: string; //color of wire
  manual: boolean;        // manual wire adjustment or not? TRue when mouseclicked once
  manualPoints?: Pt[];    // The stored polyline in panel coordinates by user
}

