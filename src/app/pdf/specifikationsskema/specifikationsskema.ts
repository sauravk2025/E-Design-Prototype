import { Component, computed, effect, ElementRef, inject, ViewChild, Signal } from '@angular/core';
import { Common } from '../../shared/common';
import { SpecifikationComponent, TavleDataComponent } from '../../shared/interfaces';

@Component({
  selector: 'app-specifikationsskema',
  imports: [],
  templateUrl: './specifikationsskema.html',
  styleUrl: './specifikationsskema.scss',
})
export class Specifikationsskema {
  public commonService = inject(Common);
  tavleData!: TavleDataComponent | null;
  specifikationData!: SpecifikationComponent | null;
  @ViewChild('specifikationsskema', { static: true })
  specifikationsskema!: ElementRef<HTMLDivElement>;

  constructor() {
    // this.tavleData = computed(() => this.commonService.tavleDataContents());
    // this.specifikationData = computed(() => this.commonService.specfikationContents());
    // console.log('tabledata:', this.tavleData());
    effect(() => {
      this.tavleData = this.commonService.tavleDataContents();
      this.specifikationData = this.commonService.specfikationContents();
      this.commonService.specifikationsskema.set(this.specifikationsskema);
      console.log(this.specifikationData)
    });
    // effect(()=>{
    //   this.commonService.specifikationsskema.set(this.specifikationsskema)
    // })
  }
}
