import { Component } from '@angular/core';
import { Header } from "../header/header";
import {ChangeDetectionStrategy} from '@angular/core';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';

@Component({
  selector: 'app-form-component',
  imports: [Header,MatFormFieldModule, MatInputModule, MatIconModule,MatSelectModule],
  templateUrl: './form-component.html',
  styleUrl: './form-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class FormComponent {


}
