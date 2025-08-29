import { Routes } from '@angular/router';
import { LoginComponent } from './core/login/login.component';
import { HomeComponent } from './modules/home/home';
import { LayoutComponent } from './core/layout/layout';

export const routes: Routes = [
  { path: '', component: LoginComponent },
    
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('./modules/home/home').then(m => m.HomeComponent )
      },
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },

  { path: '**', redirectTo: '' },
];
