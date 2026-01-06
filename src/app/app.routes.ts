import { Routes } from '@angular/router';
import { PanelDesignerComponent } from './panel-designer/panel-designer';
import { FormComponent } from './form-component/form-component';


export const routes: Routes = [

    {
        path:'form',
        component:FormComponent
    },
    {
        path:'',
        component:PanelDesignerComponent

    }
];
