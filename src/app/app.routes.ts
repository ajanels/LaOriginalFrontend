import { Routes } from '@angular/router';
import { LoginComponent } from './core/login/login.component';
import { Home } from './modules/home/home';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'home', component: Home },

];
