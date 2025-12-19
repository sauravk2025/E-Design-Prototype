import { Component, signal } from '@angular/core';
import { PanelDesignerComponent } from "./panel-designer/panel-designer";
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [PanelDesignerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('panel-new-design');
}
