import { Routes } from '@angular/router';
import { LoginComponent } from './core/login/login.component';
import { LayoutComponent } from './core/layout/layout';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  // Login en raíz
  { path: '', component: LoginComponent },

  // Área autenticada con Layout
  {
    path: '',
    component: LayoutComponent,
    children: [
      // Home
      {
        path: 'home',
        loadComponent: () =>
          import('./modules/home/home').then(m => m.HomeComponent)
      },

      // Usuarios (solo admin — como ya lo tenías)
      {
        path: 'usuarios',
        canActivate: [roleGuard],
        data: { roles: ['admin'] }, // el guard mapea "Administrador" -> "admin"
        loadComponent: () =>
          import('./modules/usuarios/usuarios/usuarios')
            .then(m => m.UsuariosComponent),
      },

      // Caja
      {
        path: 'caja',
        loadComponent: () =>
          import('./modules/caja/caja').then(m => m.Caja)
      },

      // Inventario
      {
        path: 'inventario',
        loadComponent: () =>
          import('./modules/inventario/inventario').then(m => m.Inventario)
      },

      // Ventas
      {
        path: 'ventas',
        loadComponent: () =>
          import('./modules/ventas/ventas').then(m => m.Ventas)
      },

      // Pedidos (redirige /pedidos -> /pedidos/clientes)
      {
        path: 'pedidos',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'clientes' },
          {
            path: 'clientes',
            loadComponent: () =>
              import('./modules/pedidos/clientes/clientes')
                .then(m => m.Clientes)
          },
          {
            path: 'proveedores',
            loadComponent: () =>
              import('./modules/pedidos/proveedores/proveedores')
                .then(m => m.Proveedores)
          },
        ]
      },

      // Reportes
      {
        path: 'reportes',
        loadComponent: () =>
          import('./modules/reportes/reportes').then(m => m.Reportes)
      },
       // Mantenimientos (nuevo)
      {
        path: 'mantenimientos',
        children: [
           ]
      },

      // por defecto dentro del layout
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },

  { path: '**', redirectTo: '' },
];
