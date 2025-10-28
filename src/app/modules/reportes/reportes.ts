import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

import {
  ReportesService,
  VentaDiaria,
  VentasPorUsuario,
  ClienteTop,
  VentasPorProducto,
  VentasPorCategoria,
  GananciaPorProducto,
  UsuariosResumen,
  CajaDiaria,
} from '../../services/reportes.service';

type Tab = 'dia' | 'usuario' | 'clientes' | 'producto' | 'categoria' | 'usuarios' | 'caja' | 'utilidad';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.html',
  styleUrls: ['./reportes.css'],
})
export class Reportes {
  private svc = inject(ReportesService);

  tab: Tab = 'dia';

  // Últimos 30 días por defecto
  desde = this.isoDay(new Date(Date.now() - 29 * 86400000));
  hasta = this.isoDay(new Date());

  porDia: VentaDiaria[] = [];
  porUsuario: VentasPorUsuario[] = [];
  topClienteRows: ClienteTop[] = [];
  porProducto: VentasPorProducto[] = [];
  porCategoria: VentasPorCategoria[] = [];
  porUtilidad: GananciaPorProducto[] = [];

  cajaDiaria: CajaDiaria[] = [];

  usuariosRes: UsuariosResumen | null = null;

  cargando = false;

  // Si el backend no puede calcular utilidad por usuario, hacemos fallback
  utilidadUsuarioDisponible = true;

  // ===== KPIs (ventas) =====
  get totalIngresos(): number {
    return (this.porDia || []).reduce((a, b) => a + Number(b.total || 0), 0);
  }
  get totalDocs(): number {
    return (this.porDia || []).reduce((a, b) => a + Number(b.ventas || 0), 0);
  }
  get totalUtilidadUsuarios(): number {
    return (this.porUsuario || []).reduce((a, b) => a + Number(b.utilidad || 0), 0);
  }
  get totalUtilidadProductos(): number {
    return (this.porUtilidad || []).reduce((a, b) => a + Number(b.utilidad || 0), 0);
  }

  // ===== KPIs (usuarios) =====
  get uTotal() { return this.usuariosRes?.total ?? 0; }
  get uActivos() { return this.usuariosRes?.activos ?? 0; }
  get uInactivos() { return this.usuariosRes?.inactivos ?? 0; }
  get uSuspendidos() { return this.usuariosRes?.suspendidos ?? 0; }

  // ===== KPIs (caja) =====
  get cajaIngresosTotal() { return (this.cajaDiaria || []).reduce((a, b) => a + Number(b.ingresos || 0), 0); }
  get cajaEgresosTotal() { return (this.cajaDiaria || []).reduce((a, b) => a + Number(b.egresos || 0), 0); }
  get cajaNetoTotal()     { return (this.cajaDiaria || []).reduce((a, b) => a + Number(b.neto     || 0), 0); }

  ngOnInit() { this.refrescar(); }

  isoDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString().slice(0, 10); }

  monthName(m: number) {
    const nombres = ['—','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return nombres[m] ?? String(m);
  }

  async refrescar() {
    this.cargando = true;
    const r = { desde: this.desde, hasta: this.hasta };

    try {
      if (this.tab === 'dia') {
        this.porDia = await firstValueFrom(this.svc.ventasDiarias(r));
      } else if (this.tab === 'usuario') {
        // 1er intento: incluir utilidad
        this.utilidadUsuarioDisponible = true;
        try {
          this.porUsuario = await firstValueFrom(this.svc.ventasPorUsuario(r, true));
        } catch (e: any) {
          // Fallback: sin utilidad
          this.handleError(e, 'ventas/por-usuario (con utilidad) — reintentando sin utilidad…');
          this.utilidadUsuarioDisponible = false;
          this.porUsuario = await firstValueFrom(this.svc.ventasPorUsuario(r, false))
            .catch(err => (this.handleError(err, 'ventas/por-usuario'), [] as VentasPorUsuario[]));
        }
      } else if (this.tab === 'clientes') {
        this.topClienteRows = await firstValueFrom(this.svc.topClientes(r, 10));
      } else if (this.tab === 'producto') {
        this.porProducto = await firstValueFrom(this.svc.ventasPorProducto(r));
      } else if (this.tab === 'categoria') {
        this.porCategoria = await firstValueFrom(this.svc.ventasPorCategoria(r));
      } else if (this.tab === 'usuarios') {
        this.usuariosRes = await firstValueFrom(this.svc.usuariosResumen(r));
      } else if (this.tab === 'caja') {
        this.cajaDiaria = await firstValueFrom(this.svc.cajaIngresosEgresosDiarios(r));
      } else {
        this.porUtilidad = await firstValueFrom(this.svc.gananciaPorProducto(r));
      }
    } catch (err: any) {
      this.handleError(err, `cargando ${this.tab}`);
    } finally {
      this.cargando = false;
    }
  }

  switch(tab: Tab) { if (this.tab !== tab) { this.tab = tab; this.refrescar(); } }

  exportCsv() {
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const rows: string[] = [];

    if (this.tab === 'dia') {
      rows.push('Fecha,Ventas,Items,Subtotal,Descuento,Total');
      this.porDia.forEach(r => rows.push(`${r.fecha},${r.ventas},${r.items},${r.subtotal},${r.descuento},${r.total}`));
    } else if (this.tab === 'usuario') {
      rows.push('Usuario,Ventas,Total,TicketPromedio,Utilidad');
      this.porUsuario.forEach(r => rows.push(`${esc(r.usuario)},${r.ventas},${r.total},${r.ticketPromedio},${r.utilidad ?? ''}`));
    } else if (this.tab === 'clientes') {
      rows.push('Cliente,Compras,Total,UltimaCompra');
      this.topClienteRows.forEach(r => rows.push(`${esc(r.cliente)},${r.compras},${r.total},${r.ultimaCompra ?? ''}`));
    } else if (this.tab === 'producto') {
      rows.push('Producto,Presentacion,Categoria,Cantidad,Total,PresentacionId');
      this.porProducto.forEach(r => rows.push(`${esc(r.producto)},${esc(r.presentacion)},${esc(r.categoria)},${r.cantidadVendida},${r.total},${r.presentacionId}`));
    } else if (this.tab === 'categoria') {
      rows.push('Categoria,Cantidad,Total,CategoriaId');
      this.porCategoria.forEach(r => rows.push(`${esc(r.categoria)},${r.cantidadVendida},${r.total},${r.categoriaId}`));
    } else if (this.tab === 'usuarios') {
      // Tres secciones: KPIs, Por rol, Altas/Cumples
      rows.push('Metricas de Usuarios,,,,');
      rows.push('Total,Activos,Inactivos,Suspendidos');
      rows.push(`${this.uTotal},${this.uActivos},${this.uInactivos},${this.uSuspendidos}`);
      rows.push('');
      rows.push('Usuarios por rol,,,,,');
      rows.push('Rol,Total,Activos,Inactivos,Suspendidos,RolId');
      (this.usuariosRes?.porRol || []).forEach(x =>
        rows.push(`${esc(x.rol)},${x.total},${x.activos},${x.inactivos},${x.suspendidos},${x.rolId}`)
      );
      rows.push('');
      rows.push('Altas por mes,,');
      rows.push('Periodo,Cantidad');
      (this.usuariosRes?.altasPorMes || []).forEach(x =>
        rows.push(`${x.periodo},${x.cantidad}`)
      );
      rows.push('');
      rows.push('Cumpleaños por mes,,');
      rows.push('Mes,Cantidad');
      (this.usuariosRes?.cumplesPorMes || []).forEach(x =>
        rows.push(`${this.monthName(x.mes)},${x.cantidad}`)
      );
    } else if (this.tab === 'caja') {
      rows.push('Fecha,Ingresos,Egresos,Neto');
      this.cajaDiaria.forEach(r => rows.push(`${r.fecha},${r.ingresos},${r.egresos},${r.neto}`));
      rows.push('');
      rows.push('Totales,');
      rows.push(`Ingresos,Egresos,Neto`);
      rows.push(`${this.cajaIngresosTotal},${this.cajaEgresosTotal},${this.cajaNetoTotal}`);
    } else {
      rows.push('Producto,Presentacion,Categoria,Cantidad,Venta,Costo,Utilidad,PresentacionId');
      this.porUtilidad.forEach(r => rows.push(`${esc(r.producto)},${esc(r.presentacion)},${esc(r.categoria)},${r.cantidad},${r.venta},${r.costo},${r.utilidad},${r.presentacionId}`));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-${this.tab}-${this.desde}_a_${this.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  imprimir() { window.print(); }

  private handleError(err: any, cual: string) {
    console.error('Reporte error', cual, err);
    const status = err?.status ?? '';
    const statusText = err?.statusText ?? '';
    const msg = err?.error?.message || err?.message || 'Error de red';
    this.toast('error', `Error ${cual}${status ? ` (${status} ${statusText})` : ''}: ${msg}`);
    return [];
  }

  private toast(icon: any, title: string) {
    const T = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2600 });
    T.fire({ icon, title });
  }
}
