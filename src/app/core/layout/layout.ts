import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LayoutService } from './layout.service';
import { NavbarComponent } from '../navbar/navbar';
import { filter, Subscription } from 'rxjs';

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
  imports: [CommonModule, NavbarComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.html',
  styleUrls: ['./layout.css'],
})
export class LayoutComponent implements OnInit, OnDestroy {
  private layout = inject(LayoutService);
  private router = inject(Router);
  private sub?: Subscription;

  collapsed = toSignal(this.layout.collapsed$, { initialValue: this.layout.collapsed });

  //  MENÚ actualizado con todos los módulos
  menu: MenuItem[] = [
    { label: 'Inicio',      icon: 'home',          route: '/home' },
    { label: 'Caja',        icon: 'point_of_sale', route: '/caja' },
    { label: 'Usuarios',    icon: 'group',         route: '/usuarios' },
    { label: 'Inventario',  icon: 'inventory_2',   route: '/inventario' },
    { label: 'Ventas',      icon: 'shopping_cart', route: '/ventas' },
    { label: 'Reportes',    icon: 'bar_chart',     route: '/reportes' },

    // Pedidos como submenú
    {
      label: 'Pedidos', icon: 'local_shipping', expanded: false, children: [
        { label: 'Clientes',    route: '/pedidos/clientes' },
        { label: 'Proveedores', route: '/pedidos/proveedores' },
      ]
    },

    // Mantenimientos directo (sin desplegable)
    { label: 'Mantenimientos', icon: 'settings', route: '/mantenimientos' },
  ];

  toggleSidebar() { this.layout.toggle(); }
  toggleGroup(item: MenuItem) { item.expanded = !item.expanded; }

  // Auto-expande el grupo cuyo hijo coincide con la URL
  private syncExpand(url: string) {
    for (const item of this.menu) {
      if (item.children?.length) {
        item.expanded = item.children.some(c => !!c.route && url.startsWith(c.route!));
      }
    }
  }

  ngOnInit(): void {
    this.syncExpand(this.router.url);
    this.sub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.syncExpand(e.urlAfterRedirects ?? e.url));
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
