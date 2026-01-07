import { Component, effect, ElementRef, inject, ViewChild } from '@angular/core';
import { Common } from '../../shared/common';

@Component({
  selector: 'app-tavledata',
  imports: [],
  templateUrl: './tavledata.html',
  styleUrl: './tavledata.scss',
})
export class Tavledata {
  private commonService = inject(Common);
  tavleData = this.commonService.tavleDataContents();
  @ViewChild('tavledata', { static: true }) tavledata!: ElementRef<HTMLDivElement>;
 
constructor() {
    // this.tavleData = computed(() => this.commonService.tavleDataContents());
    // this.specifikationData = computed(() => this.commonService.specfikationContents());
    // console.log('tabledata:', this.tavleData());
    effect(() => {
      this.tavleData = this.commonService.tavleDataContents();
      this.commonService.tavledata.set(this.tavledata)
    });
    // effect(()=>{
    //   this.commonService.specifikationsskema.set(this.specifikationsskema)
    // })
  }

}
