import { AfterViewInit, Component, effect, ElementRef, inject, input, ViewChild } from '@angular/core';
import { Common } from '../../shared/common';
import { PlacedPart } from '../../shared/interfaces';
import { Tavledata } from '../tavledata/tavledata';

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
    //tavleData = this.commonService.tavleDataContents();

    constructor(){
      effect(()=>{
        this.parts = this.commonService.parts()
        this.commonService.pdfTable.set(this.pdfTable)
        //this.tavleData = this.commonService.tavleDataContents();
      })
    }

}
