import { Injectable, signal } from '@angular/core';
import { PlacedPart } from './interfaces';

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
  
  private collides(r: { x: number; y: number; w: number; h: number }, railIndex: number, ignoreId: string | null): boolean {
  const list = this.parts().filter(p => p.railIndex === railIndex && p.id !== ignoreId);
  return list.some(p => r.x < p.x + p.w && r.x + r.w > p.x);
    //returns a boolean to check if collisoin occurs
  }
}
