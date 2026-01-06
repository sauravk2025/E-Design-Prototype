import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Common } from '../shared/common';
import { GRID, RAIL_WIDTH, RAIL_SPACING } from '../shared/constants';
import { PartType, PlacedPart } from '../shared/interfaces';
import { ComponentList } from '../shared/constants';

@Component({
  selector: 'app-component-library',
  imports: [CommonModule],
  templateUrl: './component-library.html',
  styleUrl: './component-library.scss',
})
export class ComponentLibrary {
  private commonService = inject(Common);
  toolbox = ComponentList;
  locked = this.commonService.locked;
  isDragging = this.commonService.isDragging
  hoverRailIndex = this.commonService.hoverRailIndex
  preview = this.commonService.preview
  railsCount = this.commonService.railsCount
  GRID = GRID
  RAIL_WIDTH = RAIL_WIDTH
  RAIL_SPACING = RAIL_SPACING
  parts = this.commonService.parts
  totalProductPrice = this.commonService.totalProductPrice
  railsTop = this.commonService.railsTop
  tagList = this.commonService.tagList

  tag:string|null = ''

  
//  getRailLeft(): number {
//     const el = this.commonService.panelEl();
//     if (!el) return 0; //if panel does not exist, return
//     const width = el.clientWidth; //Measures the panel’s current width in pixels.
//     return Math.max(0, Math.floor((width - this.RAIL_WIDTH) / 2));
//   }

  placePart(pt: PartType, railIndex: number, x: number) {
      const boundedX = Math.max(0, Math.min(this.RAIL_WIDTH - pt.w, x)); //boundedX make sure the component stays fully inside the rail horizontally.if too far bind to max lenght of rail and if too low bind to minimum
      const snappedX = Math.round(boundedX / this.GRID) * this.GRID;
      //snappedx Shift the X position to the nearest 5px step so components line up nicely.
      const y = -pt.h / 2; //Place the component so the rail runs through its center.”
  
      if (this.commonService.collides({ x: snappedX, y, w: pt.w, h: pt.h }, railIndex, null)) return;
  
      const id = crypto.randomUUID(); //id for the part
      const l = this.tagList().length;
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
        disabled: false,
        phase:pt.phase,
        phasePositionTop:'',
        phasePositionBottom:'',
        isFixed:false,
        tagName:this.tagList()[l-1]
  
      };
      this.parts.update(list => [...list, part]); //list of placed part
      

      this.totalProductPrice.update(val => val + pt.price)
    }
  

    onStartDragToolbox(pt: PartType, ev: MouseEvent) {
      if (this.locked()) return;
  
      const panelRect = this.commonService.panelEl().getBoundingClientRect();
      this.tagList().push('a')
      this.isDragging.set(true);
      this.hoverRailIndex.set(null);
      this.preview.set(null);
      //Wile dragging from sidebar to place on the rail
      const onMove = (e: MouseEvent) => {
      const mx = e.clientX, my = e.clientY;
        //clientX is Mouse X position inside the visible browser window (viewport).Ignores scrolling
        const inside =
          mx >= panelRect.left && mx <= panelRect.right &&
          my >= panelRect.top && my <= panelRect.bottom;


        //inside checks if mouse is inside panel area
        if (inside) {
          const relY = my - panelRect.top;
          let railIdx = 0, best = Infinity;

          let  usabelRails = this.railsTop().filter((item,index) => this.railsTop().length -1 !== index)
        
          usabelRails.forEach((ry, i) => {
            const d = Math.abs(relY - ry); //vertical distance between mouse and that rail
            if (d < best) { best = d; railIdx = i; }
          }); //find the closest rail 


          this.hoverRailIndex.set(railIdx); //set the rail onw which the ghost component needs to be highlighted
  
          const railLeft = this.commonService.getRailLeft();//getRailLeft() tells how many pixels from the left side of the panel the rails start, so that they’re centered horizontally.
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

            // this.railsTop().forEach((ry, i) => {
            //   const d = Math.abs(relY - ry);
            //   if (d < best) { best = d; railIdx = i; }
            // });
            let  usabelRails = this.railsTop().filter((item,index) => this.railsTop().length -1 !== index)
        
            usabelRails.forEach((ry, i) => {
              const d = Math.abs(relY - ry); //vertical distance between mouse and that rail
              if (d < best) { best = d; railIdx = i; }
            }); //find the closest rail 

            
            const railLeft = this.commonService.getRailLeft();
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
      this.tag = prompt("Enter a tag name for this element (b-z)")
      while(1){
        if(this.tag && !this.tagList().includes(this.tag)){
          this.tagList().push(this.tag)
          console.log('tagList:',this.tagList())
          break
        }
        else{
          this.tag = prompt("Enter a valid and unused tag name for this element (b-z)")
        }

      }
      
    }
  
}
