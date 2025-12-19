import { AfterViewInit, Component, effect, ElementRef, inject, input, ViewChild } from '@angular/core';
import { Common } from '../../shared/common';
import { PlacedPart } from '../../shared/interfaces';

@Component({
  selector: 'app-pdf-table',
  imports: [],
  templateUrl: './pdf-table.html',
  styleUrl: './pdf-table.scss',
})
export class PdfTable{

   
    private commonService = inject(Common);
    parts:PlacedPart[]|null = null
    @ViewChild('pdfTable', { static: true }) pdfTable!: ElementRef<HTMLDivElement>;

    constructor(){
      effect(()=>{
        this.parts = this.commonService.parts()
        console.log('pdfTable:',this.pdfTable.nativeElement)
        this.commonService.pdfTable.set(this.pdfTable)
      })
    }

}
