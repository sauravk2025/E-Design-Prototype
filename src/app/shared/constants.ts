import {  PartType } from "./interfaces";

export const colorCycle = [
    '#eb0d0dff', // strong red
    '#1976D2', // pure blue
    '#63c768ff', // pure green
    '#620988ff', // deep purple
    '#F57C00', // deep orange
    '#c95e89ff', // magenta / pinkish
    '#865bebff', // indigo
    '#00796B', // teal (not close to green)
    '#a77b6dff', // dark brown
    '#000000'  // black
  ];



  export const ComponentList: PartType[] = [
    { type: 'Tarifsikring', label: 'Tarifsikring', volt: '', w: 120, h: 120, imagePath: "assets/Tarifsikring.png", description: 'Sikringselement DIN-skinne, D02 3P, 63A', price: 100, part_number: 'WO-31306',phase:3 },

    { type: 'Transientbeskyttelse', label: 'Transientbeskyttelse', volt: '', w: 70, h: 120, imagePath: "assets/Transientbeskyttelse.png", description: 'Transientbesk. Type 2 320 TT - TN/C/S, m', price: 100, part_number: 'VAL-MS-EE-T2-3+1-320-FM',phase:3 },

    { type: 'RCD-Type-B', label: 'RCD-Type-B-40A-30mA', volt: '30mA/40A', w: 70, h: 120, imagePath: "assets/RCD-Type-B-40A-30mA-1.png", description: 'HPFI-afbryder iID 40A 4P 30mA kl. B-Si', price: 100, part_number: 'A9Z61440',phase:3 },

    { type: 'RCD', label: 'RCD-40A-30mA', volt: '30mA/40A', w: 70, h: 120, imagePath: "assets/RCD-40A-30mA-1.png", description: 'HPFI-afbryder iID 40A 4P 30mA kl. A', price: 100, part_number: 'A9Z21440',phase:3 },

    { type: 'Combi 3P+N', label: 'Combi 3P+N', volt: 'C16/30', w: 70, h: 120, imagePath: "assets/Combi-3P+N-16A.png", description: 'Kombiafbryder IC60 4P 30mA', price: 100, part_number: 'A9D67416',phase:3 },

    { type: 'Combi 3P+N', label: 'Combi 3P+N', volt: 'C13/30', w: 70, h: 120, imagePath: "assets/Combi-3P+N-13A.png", description: 'Kombiafbryder iC60 4P C 13A 30mA kl. A', price: 100, part_number: 'A9D67413',phase:3  },

    { type: 'Combi 1P+N', label: 'Combi 1P+N', volt: 'C13/30', w: 70, h: 120, imagePath: "assets/Combi-1P+N-13A.png", description: 'Kombiafbryder iCV40N C 13A 1P+N 30mA kl.', price: 100, part_number: 'A9DC3613',phase:1  },

    { type: 'Combi 1P+N', label: 'Combi 1P+N', volt: 'C10/30', w: 70, h: 120, imagePath: "assets/Combi-1P+N-10A.png", description: 'Kombiafbryder iCV40N C 10A 1P+N 30mA kl', price: 100, part_number: 'A9DC3610',phase:1  },

    { type: 'AS-3P+N', label: 'Aut. sikr. 3P+N', volt: 'C3N-16A', w: 70, h: 120, imagePath: "assets/AS-3P+N-16A.png", description: 'Automatsikring iC60N C 16A 3P+N', price: 100,part_number: 'A9F04716',phase:3  },

    { type: 'AS-3P+N', label: 'Aut. sikr. 3P+N', volt: 'C3N-13A', w: 70, h: 120, imagePath: "assets/AS-3P+N-13A.png", description: 'Automatsikring iC60N C 13A 3P+N', price: 100, part_number: 'A9F04713',phase:3  },

    { type: 'AS-3P+N', label: 'Aut. sikr. 3P+N', volt: 'C3N-10A', w: 70, h: 120, imagePath: "assets/AS-3P+N-10A.png", description: 'Automatsikring iC60N C 10A 3P+N', price: 100, part_number: 'A9F04710',phase:3  },

    { type: 'AS-1P+N', label: 'Aut. sikr. 1P+N', volt: 'CN-13A', w: 70, h: 120, imagePath: "assets/AS-1P+N-13A.png", description: 'Automatsikring iC60N C 13A 1P+N', price: 100, part_number: 'A9F04613',phase:1  },

    { type: 'AS-1P+N', label: 'Aut. sikr. 1P+N', volt: 'CN-10A', w: 70, h: 120, imagePath: "assets/AS-1P+N-10A.png", description: 'Automatsikring iC60N C 10A 1P+N', price: 100, part_number: 'A9F04610',phase:1  },

    ];




  export const  MAX_RAILS = 4;             //maximum number of rails = 5
  export const  RAIL_WIDTH = 700;          // rail width of each rail
  export const  RAIL_SPACING = 170;        // margin-top before every rail
  export const  LAST_BOTTOM_MARGIN = 150;  // extra bottom space after last rail
  export const  CONNECTOR_SIZE = 15;   //size of clickabel connector button on top of component
  export const  GRID = 5; //it is used to position at defined pixel position. 
  //(234.7, 102.3) , (398.2, 251.9) to (235, 100)(400, 250) to adjust the positon of components, wires etc
  // Router tuning
  export const  ROUTE_STEP = 10;          // ROUTE_STEP defines the grid size (in pixels) used by the A*-routing algorithm.
  //This means:Routing search happens on a 10px x 10px grid.Every wire bend (corner) occurs at multiples of 10
  export const  OBSTACLE_CLEAR = 5;       // inflate obstacles (px) to avoid collision
  export const  STUB_LEN = 10;            // initial vertical stub length from connector (px)
  // export const  RAIL_BLOCK_THICK = 12;    // Thickness” of the blocking rectangle placed over each rail.
  export const  RAIL_BLOCK_THICK = 60
  export const  FANOUT_GAP = 10;         // Spacing between wires coming out from the same port.
  export const  TURN_PENALTY = 4;    //whenever it takes a turn adds a penalty so that it takes a straight line
  export const  WIRE_CLEAR = 6;     // Wire path should avoid existing wires:
  export const  WIRE_STROKE = 3;    // stroke width for polyline (same as SVG stroke-width).