import { Component, inject } from '@angular/core';
import { Common } from '../shared/common';
import { CommonModule } from '@angular/common';
import { MAX_RAILS } from '../shared/constants';


@Component({
  selector: 'app-panel-controls',
  imports: [CommonModule],
  templateUrl: './panel-controls.html',
  styleUrl: './panel-controls.scss',
})
export class PanelControls {

  private commonService = inject(Common);

  locked = this.commonService.locked;
  railsCount = this.commonService.railsCount;
  parts = this.commonService.parts
  selectedPart = this.commonService.selectedPart
  connectionFromPartDetails = this.commonService.connectionFromPartDetails
  connectionFromPortDetails = this.commonService.connectionFromPortDetails
  connectionToPartDetails = this.commonService.connectionToPartDetails
  connectionToPortDetails = this.commonService.connectionToPortDetails
  totalRailPrice = this.commonService.totalRailPrice
  totalProductPrice = this.commonService.totalProductPrice
  pathCache = this.commonService.pathCache
  pendingFrom = this.commonService.pendingFrom
  connections = this.commonService.connections
  isDeleted = this.commonService.isDeleted
  MAX_RAILS = MAX_RAILS


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

    //Update position of external source such that it sits on the last hidden rail
    const extrenalSource = this.parts().find(item => item.isFixed);
    if (extrenalSource) {
      const lastRailIdx =this.commonService.railsTop().length - 1;
      extrenalSource.y = this.commonService.railsTop()[lastRailIdx] ;
      extrenalSource.railIndex = lastRailIdx;
      this.parts.update((p) => p.map(item => item.id === extrenalSource.id ? extrenalSource : item))    }

    // Atomic pruning (parts + wires + pending)
    const keptParts = this.parts().filter(p => p.railIndex < n || p.isFixed);
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

      this.commonService.prunePortColors(keepIds); //Removes stored color assignments for ports of deleted parts

      const pending = this.pendingFrom(); //when user clicked on component1 for the first connection points
      if (pending && !keepIds.has(pending.partId)) { //user clicked a connector to start wiring, but that part got removed → cancel pending wiring state
        this.pendingFrom.set(null);
      }
    }
    this.commonService.invalidatePaths();
  }



  finalizeLayout() {
    this.selectedPart.set(null)

    this.connectionFromPartDetails.set('')
    this.connectionFromPortDetails.set('')
    this.connectionToPartDetails.set('')
    this.connectionToPortDetails.set('')
    this.commonService.isDragging.set(false)
    this.commonService.isDeleted.set(false)

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
    this.selectedPart.set(null)

    this.connectionFromPartDetails.set('')
    this.connectionFromPortDetails.set('')
    this.connectionToPartDetails.set('')
    this.connectionToPortDetails.set('')
    this.commonService.isDragging.set(false)
    this.commonService.isDeleted.set(false)
    this.pendingFrom.set(null);

    this.parts().forEach(p => {
      p.disabled = false;
    })
    const yes = window.confirm('Unlock layout for editing? Connections remain but movement is enabled.');

    if (yes) this.locked.set(false);
  }

  deletePart() {
    this.commonService.deleteComponent()
  }

  getSelectedPart() {
    if (this.commonService.deletedPartItem()) {
      const partType = this.commonService.deletedPartItem()?.type
      return partType
    }
    return ''
  }

  getSelectedPartRail() {
    if (this.commonService.deletedPartItem()) {
      const partRailIndex = (this.commonService.deletedPartItem()?.railIndex)! + 1
      return partRailIndex
    }
    return ''
  }

}
