import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LayoutService } from './layout.service';
import { NavbarComponent } from '../navbar/navbar';

type MenuItem = {
  label: string;
  icon?: string;
  route?: string;
  children?: MenuItem[];
  expanded?: boolean;
};

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    RouterOutlet, RouterLink, RouterLinkActive
  ],
  templateUrl: './layout.html',
  styleUrls: ['./layout.css'],
})
export class LayoutComponent {
  private layout = inject(LayoutService);

  collapsed = toSignal(this.layout.collapsed$, { initialValue: this.layout.collapsed });

  menu: MenuItem[] = [
    { label: 'Inicio', icon: 'home', route: '/home' },
    { label: 'Caja', icon: 'point_of_sale', route: '/caja' },
    {
      label: 'Usuarios', icon: 'group', children: [
        { label: 'Empleados', route: '/mantenimientos/empleados' },
        { label: 'Clientes',  route: '/mantenimientos/clientes'  },
      ]
    },
    { label: 'Inventario',  icon: 'inventory_2',   route: '/inventario' },
    { label: 'Ventas',      icon: 'shopping_cart', route: '/ventas'     },
    { label: 'Pedidos',     icon: 'local_shipping',route: '/pedidos'    },
    {
      label: 'Mantenimientos', icon: 'settings', children: [
        { label: 'Categorías', route: '/mantenimientos/categorias' },
        { label: 'Productos',  route: '/mantenimientos/productos'  },
      ]
    },
    { label: 'Cerrar sesión', icon: 'logout', route: '/logout' },
  ];

  toggleSidebar() { this.layout.toggle(); }
  toggleGroup(item: MenuItem) { item.expanded = !item.expanded; }
}
