import { Component, effect, inject } from '@angular/core';
import { Header } from "../header/header";
import {ChangeDetectionStrategy} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Common } from '../shared/common';
import { SpecifikationComponent, TavleDataComponent } from '../shared/interfaces';
import { Router } from '@angular/router';
import {CommonModule } from '@angular/common';

@Component({
  selector: 'app-form-component',
  imports: [Header,MatFormFieldModule, MatInputModule, MatIconModule,MatSelectModule,FormsModule,CommonModule],
  templateUrl: './form-component.html',
  styleUrl: './form-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class FormComponent {

  private commonService = inject(Common)

  constructor(private router: Router) { }

  projectName_pages:string = ''
  ing_pages:string = '?'
  Pronr_pages:string = '?'


  Producktionsdato_page1!:number;
  Bemaerkninger_page1:string = ''

  Antal_page2:string = 'stk.'
  Planlagt_page2:string = 'Uge XX D X'


  Medlever_page2:string = '';
  Medlever_Options = ['Ja','Nej']

  label_page1:string = '63A'
  label_Options = ['25A', '35A', '63A']

  lage_page2:string = ''
  lage_Options = ['Ingen lage','Med lage']

  Dokumentation_page2 :string = ''
  Dokumentation_Options = ['Der skal ikke medleveres dokumentation', 'Der skal medleveres dokumentation']


  
 
  


  formSubmit(){
    const tavleData:TavleDataComponent = {
    projectName : this.projectName_pages,
    ing:this. ing_pages,
    Pronr: this.Pronr_pages,
    Producktionsdato:this.Producktionsdato_page1,
    Bemaerkninger: this.Bemaerkninger_page1,
    label:this. label_page1
  }

  const specifikationData:SpecifikationComponent = {
    projectName : this.projectName_pages,
    ing:this. ing_pages,
    Pronr: this.Pronr_pages,
    Antal:this. Antal_page2,
    Planlagt:this.Planlagt_page2,
    Medlever:this.Medlever_page2,
    lage:this.lage_page2,
    Dokumentation:this.Dokumentation_page2,
  }
    this.commonService.tavleDataContents.set(tavleData);
    this.commonService.specfikationContents.set(specifikationData)


    this.router.navigate(['/panel'])
  }

}
