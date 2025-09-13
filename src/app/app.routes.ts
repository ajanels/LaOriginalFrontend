// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { LoginComponent } from './core/login/login.component';
import { LayoutComponent } from './core/layout/layout';
import { authGuard, authGuardMatch } from './services/auth.guard'; // 👈 importa ambos

export const routes: Routes = [
  // Raíz -> redirige al login
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  // Página de login
  { path: 'login', component: LoginComponent },

  // Área autenticada con Layout (TODOS los hijos protegidos)
  {
    path: '',
    component: LayoutComponent,
    canMatch: [authGuardMatch],        // 👈 evita que se cargue el layout sin login
    canActivateChild: [authGuard],     // 👈 revalida al navegar por los hijos
    children: [
      {
        path: 'home',
        loadComponent: () => import('./modules/home/home').then(m => m.HomeComponent)
      },

      // Usuarios solo admin (usa el mismo guard con data.roles)
      {
        path: 'usuarios',
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./modules/usuarios/usuarios/usuarios').then(m => m.UsuariosComponent),
      },

      { path: 'caja',       loadComponent: () => import('./modules/caja/caja').then(m => m.Caja) },
      { path: 'inventario', loadComponent: () => import('./modules/inventario/inventario').then(m => m.Inventario) },
      { path: 'ventas',     loadComponent: () => import('./modules/ventas/ventas').then(m => m.Ventas) },

      {
        path: 'pedidos',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'clientes' },
          { path: 'clientes',    loadComponent: () => import('./modules/pedidos/clientes/clientes').then(m => m.Clientes) },
          { path: 'proveedores', loadComponent: () => import('./modules/pedidos/proveedores/proveedores').then(m => m.Proveedores) },
        ]
      },

      { path: 'reportes', loadComponent: () => import('./modules/reportes/reportes').then(m => m.Reportes) },

      {
        path: 'mantenimientos',
        children: [
          { path: '',               loadComponent: () => import('./modules/mantenimientos/mantenimientos').then(m => m.Mantenimientos) },
          { path: 'categorias',     loadComponent: () => import('./modules/mantenimientos/categorias/categorias').then(m => m.Categorias) },
          { path: 'marcas',         loadComponent: () => import('./modules/mantenimientos/marcas/marcas').then(m => m.Marcas) },
          { path: 'colores',        loadComponent: () => import('./modules/mantenimientos/colores/colores').then(m => m.Colores) },
          { path: 'unidades-medida',loadComponent: () => import('./modules/mantenimientos/unidades-medida/unidades-medida').then(m => m.UnidadesMedida) },
          { path: 'formas-pago',    loadComponent: () => import('./modules/mantenimientos/formas-pago/formas-pago').then(m => m.FormasPago) },
          { path: 'estados',        loadComponent: () => import('./modules/mantenimientos/estados/estados').then(m => m.Estados) },
          { path: 'clientes',       loadComponent: () => import('./modules/mantenimientos/clientes/clientes').then(m => m.Clientes) },
          { path: 'proveedores',    loadComponent: () => import('./modules/mantenimientos/proveedores/proveedores').then(m => m.Proveedores) },
          { path: 'roles',          loadComponent: () => import('./modules/mantenimientos/roles/roles').then(m => m.Roles) },
        ]
      },

      { path: '**', redirectTo: 'home' },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
