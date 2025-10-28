import { Routes } from '@angular/router';

// Login está en core/login (no en core/auth/login)
import { LoginComponent } from './core/login/login.component';
import { LayoutComponent } from './core/layout/layout';

import { authGuard, authGuardMatch } from './services/auth.guard';
import { forceChangeGuard } from './core/auth/force-change.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  // Público
  { path: 'login', component: LoginComponent },

  // Protegido
  {
    path: '',
    component: LayoutComponent,
    canMatch: [authGuardMatch],
    canActivateChild: [authGuard, forceChangeGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./modules/home/home').then(m => m.HomeComponent)
      },

      {
        path: 'cambiar-password',
        loadComponent: () =>
          import('./core/auth/change-password/change-password.component')
            .then(m => m.ChangePasswordComponent)
      },

      {
        path: 'usuarios',
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./modules/usuarios/usuarios/usuarios').then(m => m.UsuariosComponent),
      },

      { path: 'caja',       loadComponent: () => import('./modules/caja/caja').then(m => m.CajaComponent) },
      { path: 'inventario', loadComponent: () => import('./modules/inventario/inventario').then(m => m.InventarioComponent) },
      { path: 'ventas',     loadComponent: () => import('./modules/ventas/ventas').then(m => m.Ventas) },

      {
        path: 'pedidos',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'clientes' },
          { path: 'clientes',    loadComponent: () => import('./modules/pedidos/clientes/clientes').then(m => m.PedidosClientesComponent) },
          { path: 'proveedores', loadComponent: () => import('./modules/pedidos/proveedores/proveedores').then(m => m.PedidosProveedores) },
        ]
      },

      { path: 'reportes', loadComponent: () => import('./modules/reportes/reportes').then(m => m.Reportes) },

      {
        path: 'mantenimientos',
        children: [
          { path: '',               loadComponent: () => import('./modules/mantenimientos/mantenimientos').then(m => m.Mantenimientos) },
          { path: 'categorias',     loadComponent: () => import('./modules/mantenimientos/categorias/categorias').then(m => m.Categorias) },
          { path: 'marcas',         loadComponent: () => import('./modules/mantenimientos/marcas/marcas').then(m => m.Marcas) },
          { path: 'unidades-medida',loadComponent: () => import('./modules/mantenimientos/unidades-medida/unidades-medida').then(m => m.UnidadesMedida) },
          { path: 'formas-pago',    loadComponent: () => import('./modules/mantenimientos/formas-pago/formas-pago').then(m => m.FormasPago) },
          { path: 'clientes',       loadComponent: () => import('./modules/mantenimientos/clientes/clientes').then(m => m.Clientes) },
          { path: 'productos',      loadComponent: () => import('./modules/mantenimientos/productos/productos').then(m => m.MantProductosComponent) },
          { path: 'proveedores',    loadComponent: () => import('./modules/mantenimientos/proveedores/proveedores').then(m => m.MantProveedoresComponent) },
          { path: 'roles',          loadComponent: () => import('./modules/mantenimientos/roles/roles').then(m => m.Roles) }
        ]
      },

      { path: '**', redirectTo: 'home' },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
