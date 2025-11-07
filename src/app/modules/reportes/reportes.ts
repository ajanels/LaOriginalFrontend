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
  CajaSesionCerrada,
  VentasPorFormaPago,
  ComprasPorProveedor,
  PedidosCobrosFormaPagoResp,
  PedidosCobrosDetalle,
  PedidosEstadoRow,
  PedidosTopProductoRow,
} from '../../services/reportes.service';

import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';

type Tab =
  | 'dia' | 'usuario' | 'clientes' | 'producto' | 'categoria'
  | 'fp'   // ventas por forma de pago
  | 'compras' // compras por proveedor
  | 'usuarios' | 'caja' | 'utilidad'
  | 'pedidos';

type CajaView = 'diario' | 'sesiones';
type PedidosView = 'fp' | 'detalle' | 'estados' | 'top';
type Modo = 'tabla' | 'graficas';

const TOP_N = 12;

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './reportes.html',
  styleUrls: ['./reportes.css'],
})
export class Reportes {
  private svc = inject(ReportesService);

  tab: Tab = 'dia';
  modo: Modo = 'tabla';
  cajaView: CajaView = 'diario';
  pedidosView: PedidosView = 'fp';

  // Calendarios vacíos por defecto
  desde: string = '';
  hasta: string = '';

  porDia: VentaDiaria[] = [];
  porUsuario: VentasPorUsuario[] = [];
  topClienteRows: ClienteTop[] = [];
  porProducto: VentasPorProducto[] = [];
  porCategoria: VentasPorCategoria[] = [];
  porUtilidad: GananciaPorProducto[] = [];

  ventasFp: VentasPorFormaPago[] = [];
  comprasProv: ComprasPorProveedor[] = [];

  cajaDiaria: CajaDiaria[] = [];
  cajaSesiones: CajaSesionCerrada[] = [];

  // Pedidos
  pedFp: PedidosCobrosFormaPagoResp | null = null;
  pedDetalle: PedidosCobrosDetalle[] = [];
  pedEstados: PedidosEstadoRow[] = [];
  pedTop: PedidosTopProductoRow[] = [];

  usuariosRes: UsuariosResumen | null = null;

  cargando = false;
  utilidadUsuarioDisponible = true;

  private money = (n: number) => `Q ${new Intl.NumberFormat('es-GT').format(Number(n || 0))}`;
  private isoDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
  monthName(m: number) {
    const nombres = ['—','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return nombres[m] ?? String(m);
  }

  // ====== Estados de pedido: helpers visuales ======
  estadoLabel(n: number | string | null | undefined): string {
    const v = Number(n ?? -1);
    switch (v) {
      case 0: return 'Borrador';
      case 1: return 'Confirmado';
      case 2: return 'En preparación';
      case 3: return 'Listo';
      case 4: return 'Entregado';
      case 9: return 'Cancelado';
      default: return String(n ?? '—');
    }
  }
  /** Devuelve la clase para el badge del estado */
  estadoClass(n: number | string | null | undefined): string {
    const v = Number(n ?? -1);
    if (v === 0) return 'borrador';
    if (v === 1) return 'confirmado';
    if (v === 2) return 'enprep';
    if (v === 3) return 'listo';
    if (v === 4) return 'entregado';
    if (v === 9) return 'cancelado';
    return '';
  }

  // ——— Totales
  get totalIngresos() { return (this.porDia || []).reduce((a,b)=>a+Number(b.total||0),0); }
  get totalDocs()     { return (this.porDia || []).reduce((a,b)=>a+Number(b.ventas||0),0); }
  get totalUtilidadUsuarios()  { return (this.porUsuario  || []).reduce((a,b)=>a+Number((b as any).utilidad||0),0); }
  get totalUtilidadProductos() { return (this.porUtilidad || []).reduce((a,b)=>a+Number(b.utilidad||0),0); }

  get uTotal()       { return this.usuariosRes?.total ?? 0; }
  get uActivos()     { return this.usuariosRes?.activos ?? 0; }
  get uInactivos()   { return this.usuariosRes?.inactivos ?? 0; }
  get uSuspendidos() { return this.usuariosRes?.suspendidos ?? 0; }

  get cajaIngresosTotal(){ return (this.cajaDiaria||[]).reduce((a,b)=>a+Number(b.ingresos||0),0); }
  get cajaEgresosTotal() { return (this.cajaDiaria||[]).reduce((a,b)=>a+Number(b.egresos||0),0); }
  get cajaNetoTotal()    { return (this.cajaDiaria||[]).reduce((a,b)=>a+Number(b.neto    ||0),0); }

  get cajaSesTotInicial(){  return (this.cajaSesiones||[]).reduce((a,b)=>a+Number(b.montoInicial||0),0); }
  get cajaSesTotIngresos(){ return (this.cajaSesiones||[]).reduce((a,b)=>a+Number(b.ingresos||0),0); }
  get cajaSesTotEgresos(){  return (this.cajaSesiones||[]).reduce((a,b)=>a+Number(b.egresos||0),0); }
  get cajaSesTotNeto(){     return (this.cajaSesiones||[]).reduce((a,b)=>a+Number(b.neto||0),0); }

  ngOnInit(){ this.refrescar(); }

  // Si no hay fechas elegidas, usa 30 días previos, pero sin tocar los inputs (siguen vacíos).
  private buildRange(){
    if (!this.desde && !this.hasta){
      const d = this.isoDay(new Date(Date.now() - 29 * 86400000));
      const h = this.isoDay(new Date());
      return { desde: d, hasta: h };
    }
    const r: any = {};
    if (this.desde) r.desde = this.desde;
    if (this.hasta) r.hasta = this.hasta;
    return r;
  }

  async refrescar() {
    this.cargando = true;
    const r = this.buildRange();

    try {
      if (this.tab === 'dia') {
        this.porDia = await firstValueFrom(this.svc.ventasDiarias(r))
          .then(d => d || []).catch(e => this.handleError(e,'ventas/diarias'));
        this.buildVentasDiaChart();
      } else if (this.tab === 'usuario') {
        this.utilidadUsuarioDisponible = true;
        try {
          this.porUsuario = await firstValueFrom(this.svc.ventasPorUsuario(r, true)).then(d => d || []);
        } catch (e:any) {
          this.handleError(e,'ventas/por-usuario (con utilidad) — reintentando sin utilidad…');
          this.utilidadUsuarioDisponible = false;
          this.porUsuario = await firstValueFrom(this.svc.ventasPorUsuario(r, false))
            .then(d => d || []).catch(err => this.handleError(err,'ventas/por-usuario'));
        }
        this.buildUsuarioChart();
      } else if (this.tab === 'clientes') {
        this.topClienteRows = await firstValueFrom(this.svc.topClientes(r, 10))
          .then(d => d || []).catch(e => this.handleError(e,'top-clientes'));
        this.buildClientesChart();
      } else if (this.tab === 'producto') {
        this.porProducto = await firstValueFrom(this.svc.ventasPorProducto(r))
          .then(d => d || []).catch(e => this.handleError(e,'ventas/por-producto'));
        this.buildProductoChart();
      } else if (this.tab === 'categoria') {
        this.porCategoria = await firstValueFrom(this.svc.ventasPorCategoria(r))
          .then(d => d || []).catch(e => this.handleError(e,'ventas/por-categoria'));
        this.buildCategoriaChart();
      } else if (this.tab === 'fp') {
        this.ventasFp = await firstValueFrom(this.svc.ventasPorFormaPago(r))
          .then(d => d || []).catch(e => this.handleError(e,'ventas/por-forma-pago'));
        this.buildVentasFpChart();
      } else if (this.tab === 'compras') {
        this.comprasProv = await firstValueFrom(this.svc.comprasPorProveedor(r))
          .then(d => d || []).catch(e => this.handleError(e,'compras/por-proveedor'));
        this.buildComprasChart();
      } else if (this.tab === 'usuarios') {
        this.usuariosRes = await firstValueFrom(this.svc.usuariosResumen(r))
          .then(d => d || null).catch(e => { this.handleError(e,'usuarios/resumen'); return null; });
        this.buildUsuariosChart();
      } else if (this.tab === 'caja') {
        if (this.cajaView === 'diario') {
          this.cajaDiaria = await firstValueFrom(this.svc.cajaIngresosEgresosDiarios(r))
            .then(d => d || []).catch(e => this.handleError(e,'caja/diario'));
          this.buildCajaDiariaChart();
        } else {
          this.cajaSesiones = await firstValueFrom(this.svc.cajaSesionesCerradas(r))
            .then(d => d || []).catch(e => this.handleError(e,'caja/sesiones'));
          this.buildCajaSesionesChart();
        }
      } else if (this.tab === 'pedidos') {
        if (this.pedidosView === 'fp') {
          this.pedFp = await firstValueFrom(this.svc.pedidosCobrosFormaPago(r))
            .then(d => d || null).catch(e => { this.handleError(e,'pedidos/cobros-forma-pago'); return null; });
          this.buildPedFpChart();
        } else if (this.pedidosView === 'detalle') {
          this.pedDetalle = await firstValueFrom(this.svc.pedidosCobrosDetalle(r))
            .then(d => d || []).catch(e => this.handleError(e,'pedidos/cobros-detalle'));
        } else if (this.pedidosView === 'estados') {
          this.pedEstados = await firstValueFrom(this.svc.pedidosEstados(r))
            .then(d => d || []).catch(e => this.handleError(e,'pedidos/estados'));
          this.buildPedEstadosChart();
        } else {
          this.pedTop = await firstValueFrom(this.svc.pedidosTopProductos(r, { take: 12 }))
            .then(d => d || []).catch(e => this.handleError(e,'pedidos/top-productos'));
          this.buildPedTopChart();
        }
      } else {
        this.porUtilidad = await firstValueFrom(this.svc.gananciaPorProducto(r))
          .then(d => d || []).catch(e => this.handleError(e,'utilidad/por-producto'));
        this.buildUtilidadChart();
      }
    } finally {
      this.cargando = false;
    }
  }

  setTab(tab: Tab){ if (this.tab!==tab){ this.tab = tab; this.refrescar(); } }
  setCajaView(v: CajaView){ if (this.cajaView!==v){ this.cajaView = v; this.refrescar(); } }
  setPedidosView(v: PedidosView){ if (this.pedidosView!==v){ this.pedidosView = v; this.refrescar(); } }
  setModo(m: Modo){ this.modo = m; }

  get cajaSesionesAgrupadas() {
    const map = new Map<string, CajaSesionCerrada[]>();
    for (const s of (this.cajaSesiones||[])) {
      const arr = map.get(s.cierreDia) || [];
      arr.push(s); map.set(s.cierreDia, arr);
    }
    return Array.from(map.entries())
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([dia, sesiones])=>{
        const totInicial = sesiones.reduce((a,b)=>a+Number(b.montoInicial||0),0);
        const totIng     = sesiones.reduce((a,b)=>a+Number(b.ingresos||0),0);
        const totEgr     = sesiones.reduce((a,b)=>a+Number(b.egresos||0),0);
        const totNeto    = sesiones.reduce((a,b)=>a+Number(b.neto||0),0);
        return { dia, sesiones, totInicial, totIng, totEgr, totNeto };
      });
  }

  exportCsv(){
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const rows: string[] = [];
    if (this.tab === 'dia') {
      rows.push('Fecha,Ventas,Items,Subtotal,Descuento,Total');
      this.porDia.forEach(r => rows.push(`${r.fecha},${r.ventas},${r.items},${r.subtotal},${r.descuento},${r.total}`));
    } else if (this.tab === 'usuario') {
      rows.push('Usuario,Ventas,Total,TicketPromedio,Utilidad');
      this.porUsuario.forEach(r => rows.push(`${esc(r.usuario)},${r.ventas},${r.total},${r.ticketPromedio},${(r as any).utilidad ?? ''}`));
    } else if (this.tab === 'clientes') {
      rows.push('Cliente,Compras,Total,UltimaCompra');
      this.topClienteRows.forEach(r => rows.push(`${esc(r.cliente)},${r.compras},${r.total},${r.ultimaCompra ?? ''}`));
    } else if (this.tab === 'producto') {
      rows.push('Producto,Presentacion,Categoria,Cantidad,Total,PresentacionId');
      this.porProducto.forEach(r => rows.push(`${esc(r.producto)},${esc(r.presentacion)},${esc(r.categoria)},${r.cantidadVendida},${r.total},${r.presentacionId}`));
    } else if (this.tab === 'categoria') {
      rows.push('Categoria,Cantidad,Total,CategoriaId');
      this.porCategoria.forEach(r => rows.push(`${esc(r.categoria)},${r.cantidadVendida},${r.total},${r.categoriaId}`));
    } else if (this.tab === 'fp') {
      rows.push('FormaPago,Ventas,Total,TicketPromedio,FormaPagoId');
      this.ventasFp.forEach(r => rows.push(`${esc(r.formaPago)},${r.ventas},${r.total},${r.ticketPromedio},${r.formaPagoId ?? ''}`));
    } else if (this.tab === 'compras') {
      rows.push('Proveedor,Documentos,Total,UltimaCompra,ProveedorId');
      this.comprasProv.forEach(r => rows.push(`${esc(r.proveedor)},${r.documentos},${r.total},${r.ultimaCompra ?? ''},${r.proveedorId}`));
    } else if (this.tab === 'usuarios') {
      rows.push('Metricas de Usuarios,,,,');
      rows.push('Total,Activos,Inactivos,Suspendidos');
      rows.push(`${this.uTotal},${this.uActivos},${this.uInactivos},${this.uSuspendidos}`);
      rows.push('');
      rows.push('Usuarios por rol,,,,,');
      rows.push('Rol,Total,Activos,Inactivos,Suspendidos,RolId');
      (this.usuariosRes?.porRol || []).forEach(x =>
        rows.push(`${esc(x.rol)},${x.total},${x.activos},${x.inactivos},${x.suspendidos},${x.rolId}`));
      rows.push('');
      rows.push('Altas por mes,,');
      rows.push('Periodo,Cantidad');
      (this.usuariosRes?.altasPorMes || []).forEach(x => rows.push(`${x.periodo},${x.cantidad}`));
      rows.push('');
      rows.push('Cumpleaños por mes,,');
      rows.push('Mes,Cantidad');
      (this.usuariosRes?.cumplesPorMes || []).forEach((x: any) => {
        rows.push(`${this.monthName(x.mes)},${x.cantidad}`);
      });
    } else if (this.tab === 'caja') {
      if (this.cajaView === 'diario') {
        rows.push('Fecha,Ingresos,Egresos,Neto');
        this.cajaDiaria.forEach(r => rows.push(`${r.fecha},${r.ingresos},${r.egresos},${r.neto}`));
        rows.push('');
        rows.push('Totales,');
        rows.push('Ingresos,Egresos,Neto');
        rows.push(`${this.cajaIngresosTotal},${this.cajaEgresosTotal},${this.cajaNetoTotal}`);
      } else {
        rows.push('CierreDia,AperturaId,Codigo,Cajero,FechaAperturaUtc,FechaCierreUtc,MontoInicial,Ingresos,Egresos,Neto');
        this.cajaSesiones.forEach(s =>
          rows.push(`${s.cierreDia},${s.aperturaId},"${s.codigo}","${s.cajeroNombre || ''}",${s.fechaAperturaUtc},${s.fechaCierreUtc},${s.montoInicial},${s.ingresos},${s.egresos},${s.neto}`));
        rows.push('');
        rows.push('Totales,,');
        rows.push('Inicial,Ingresos,Egresos,Neto');
        rows.push(`${this.cajaSesTotInicial},${this.cajaSesTotIngresos},${this.cajaSesTotEgresos},${this.cajaSesTotNeto}`);
      }
    } else if (this.tab === 'pedidos') {
      if (this.pedidosView === 'fp') {
        rows.push('FormaPago,Cobros,Devoluciones,Neto,CantCobros,CantDevoluciones,FechaMin,FechaMax,FormaPagoId');
        (this.pedFp?.filas || []).forEach(r =>
          rows.push(`${esc(r.formaPago)},${r.cobros},${r.devoluciones},${r.neto},${r.cantCobros},${r.cantDevoluciones},${r.fechaMin ?? ''},${r.fechaMax ?? ''},${r.formaPagoId ?? ''}`));
        rows.push('');
        rows.push('Totales,');
        rows.push('TotalCobros,TotalDevoluciones,TotalNeto');
        rows.push(`${this.pedFp?.totalCobros || 0},${this.pedFp?.totalDevoluciones || 0},${this.pedFp?.totalNeto || 0}`);
      } else if (this.pedidosView === 'detalle') {
        rows.push('Fecha,PagoId,PedidoId,Monto,EsDevolucion,FormaPago,Cliente,EstadoPedido,FormaPagoId,ClienteId,Referencia,Notas');
        this.pedDetalle.forEach(r =>
          rows.push(`${r.fechaUtc},${r.pagoId},${r.pedidoId},${r.monto},${r.esDevolucion},${esc(r.formaPago)},${esc(r.cliente)},${esc(this.estadoLabel(r.estadoPedido))},${r.formaPagoId},${r.clienteId},${esc(r.referencia||'')},${esc(r.notas||'')}`));
      } else if (this.pedidosView === 'estados') {
        rows.push('Estado,Cantidad,Total,PagadoNeto,Saldo');
        this.pedEstados.forEach(r =>
          rows.push(`${esc(this.estadoLabel(r.estado))},${r.cantidad},${r.total},${r.pagadoNeto},${r.saldo}`));
      } else {
        rows.push('Presentacion,Cantidad,Importe,PresentacionId');
        this.pedTop.forEach(r =>
          rows.push(`${esc(r.presentacion || '')},${r.cantidad},${r.importe},${r.presentacionId}`));
      }
    } else {
      rows.push('Producto,Presentacion,Categoria,Cantidad,Venta,Costo,Utilidad,PresentacionId');
      this.porUtilidad.forEach(r =>
        rows.push(`"${r.producto}","${r.presentacion}","${r.categoria}",${r.cantidad},${r.venta},${r.costo},${r.utilidad},${r.presentacionId}`));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-${this.tab}${this.tab==='caja' ? `-${this.cajaView}` : (this.tab==='pedidos' ? `-${this.pedidosView}` : '')}-${(this.desde||'auto')}_a_${(this.hasta||'auto')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    this.Toast.fire({ icon: 'success', title: 'CSV exportado' });
  }

  imprimir(){ window.print(); }

  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    didOpen: (t) => {
      t.addEventListener('mouseenter', Swal.stopTimer);
      t.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  private handleError(err:any, cual:string){
    console.error('Reporte error', cual, err);
    if (err?.status === 0) {
      this.Toast.fire({ icon:'error', title:'No hay conexión con el servidor.' });
      return [] as any;
    }
    this.swalErrorFrom(err, 'Error al cargar reportes');
    return [] as any;
  }

  private extractError(e: any): string {
    try {
      if (e?.status === 0) return 'No hay conexión con el servidor.';
      const err = e?.error;
      if (typeof err === 'string') return err;
      if (err?.errors && typeof err.errors === 'object') {
        const lines: string[] = [];
        for (const k of Object.keys(err.errors)) {
          const msgs = err.errors[k];
          if (Array.isArray(msgs)) msgs.forEach((m: any) => lines.push(`${k}: ${m}`));
        }
        if (lines.length) return lines.join(' | ');
      }
      const msg = err?.message || err?.detail || err?.title;
      if (msg) return msg;
      return `Error ${e?.status || ''} ${e?.statusText || ''}`.trim();
    } catch {
      return 'Error desconocido.';
    }
  }

  private swalErrorFrom(e: any, titulo = 'Error'): void {
    Swal.fire({ icon: 'error', title: titulo, text: this.extractError(e), confirmButtonText: 'Entendido' });
  }

  // ================== CHARTS ==================
  lineDiaData: ChartData<'line'> = { labels: [], datasets: [] };
  lineDiaOpts: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { callbacks: { label: (ctx: TooltipItem<'line'>) => `Total: ${this.money(Number(ctx.parsed.y))}` } }
    },
    scales: {
      x: { title: { display: true, text: 'Día' } },
      y: { beginAtZero: true, title: { display: true, text: 'Q (quetzales)' },
        ticks: { callback: v => this.money(Number(v as number)) } }
    }
  };
  private buildVentasDiaChart(){
    const labels = this.porDia.map(x=>x.fecha);
    const tot = this.porDia.map(x=>Number(x.total||0));
    this.lineDiaData = { labels, datasets: [{ label: 'Total vendido', data: tot, tension:.25, fill: true, pointRadius: 2 }] };
  }

  barUserData: ChartData<'bar'> = { labels: [], datasets: [] };
  barUserOpts: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { position: 'top' },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => `${c.dataset.label}: ${this.money(Number(c.parsed.x))}` } } },
    scales: {
      x: { beginAtZero: true, title: { display: true, text: 'Q (quetzales)' },
           ticks: { callback: v => this.money(Number(v as number)) } },
      y: { title: { display: true, text: 'Usuario' }, ticks: { autoSkip: false } }
    }
  };
  private buildUsuarioChart(){
    const rows = [...this.porUsuario].sort((a,b)=>Number(b.total)-Number(a.total));
    this.barUserData = {
      labels: rows.map(x=>x.usuario),
      datasets: [{ label: 'Total vendido', data: rows.map(x=>Number(x.total||0)), borderRadius: 6, maxBarThickness: 26 }]
    };
  }

  barClientesData: ChartData<'bar'> = { labels: [], datasets: [] };
  barClientesOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins: { legend:{ position:'top' },
      tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `Total: ${this.money(Number(c.parsed.y))}` } } },
    scales: {
      x: { title:{ display:true, text:'Cliente' }, ticks: { autoSkip: false } },
      y: { beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildClientesChart(){
    const labels = this.topClienteRows.map(x=>x.cliente);
    const data = this.topClienteRows.map(x=>Number(x.total||0));
    this.barClientesData = { labels, datasets:[{ label:'Total', data, borderRadius:6 }] };
  }

  barProductoData: ChartData<'bar'> = { labels: [], datasets: [] };
  barProductoOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' }, tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `Total: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Producto' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildProductoChart(){
    const rows = [...this.porProducto].sort((a,b)=>Number(b.total)-Number(a.total));
    const top = rows.slice(0, TOP_N);
    const resto = rows.slice(TOP_N).reduce((a,b)=>a+Number(b.total||0),0);
    const labels = top.map(x=>x.producto); const data = top.map(x=>Number(x.total||0));
    if (resto>0){ labels.push('Otros'); data.push(resto); }
    this.barProductoData = { labels, datasets:[{ label: 'Total', data, borderRadius:6 }] };
  }

  barCategoriaData: ChartData<'bar'> = { labels: [], datasets: [] };
  barCategoriaOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' }, tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `Total: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Categoría' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildCategoriaChart(){
    const rows = [...this.porCategoria].sort((a,b)=>Number(b.total)-Number(a.total));
    this.barCategoriaData = { labels: rows.map(x=>x.categoria || '(sin categoría)'),
      datasets: [{ label:'Total', data: rows.map(x=>Number(x.total||0)), borderRadius:6 }] };
  }

  // NUEVO: Ventas por forma de pago
  barFpData: ChartData<'bar'> = { labels: [], datasets: [] };
  barFpOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' },
      tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `${c.dataset.label}: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Forma de pago' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildVentasFpChart(){
    const labels = this.ventasFp.map(x=>x.formaPago || '(Sin forma)');
    const data = this.ventasFp.map(x=>Number(x.total||0));
    this.barFpData = { labels, datasets:[{ label:'Total', data, borderRadius:6 }] };
  }

  // NUEVO: Compras por proveedor
  barComprasData: ChartData<'bar'> = { labels: [], datasets: [] };
  barComprasOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' },
      tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `${c.dataset.label}: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Proveedor' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildComprasChart(){
    const rows = [...this.comprasProv].sort((a,b)=>Number(b.total)-Number(a.total));
    const top = rows.slice(0, TOP_N);
    const resto = rows.slice(TOP_N).reduce((a,b)=>a+Number(b.total||0),0);
    const labels = top.map(x=>x.proveedor);
    const data = top.map(x=>Number(x.total||0));
    if (resto>0){ labels.push('Otros'); data.push(resto); }
    this.barComprasData = { labels, datasets:[{ label:'Total', data, borderRadius:6 }] };
  }

  barUsuariosData: ChartData<'bar'> = { labels: [], datasets: [] };
  barUsuariosOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' } },
    scales:{ x:{ title:{ display:true, text:'Periodo' } },
             y:{ beginAtZero:true, title:{ display:true, text:'Cantidad' } } }
  };
  private buildUsuariosChart(){
    const rows = this.usuariosRes?.altasPorMes || [];
    this.barUsuariosData = { labels: rows.map(x=>x.periodo),
      datasets: [{ label:'Altas', data: rows.map(x=>x.cantidad), borderRadius:6 }] };
  }

  // === Caja (barras + línea) ===
  barCajaDiaData: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  barCajaDiaOpts: ChartOptions<'bar' | 'line'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar' | 'line'>) => {
        const lbl = c.dataset.label || ''; const val = Number((c.parsed as any).y || 0);
        return lbl.toLowerCase().includes('egres') ? `${lbl}: -${this.money(val)}` : `${lbl}: ${this.money(val)}`;
      } } } },
    scales: {
      x: { title: { display: true, text: 'Día' } },
      y: { beginAtZero: true, title: { display: true, text: 'Q (quetzales)' },
           ticks: { callback: v => this.money(Number(v as number)) } },
      y1: { position: 'right', grid: { drawOnChartArea: false },
           ticks: { callback: v => this.money(Number(v as number)) } }
    }
  };
  private buildCajaDiariaChart() {
    const labels   = this.cajaDiaria.map(x => x.fecha);
    const ingresos = this.cajaDiaria.map(x => Number(x.ingresos || 0));
    const egresos  = this.cajaDiaria.map(x => Number(x.egresos || 0));
    const neto     = this.cajaDiaria.map(x => Number(x.neto    || 0));
    this.barCajaDiaData = {
      labels,
      datasets: [
        { label: 'Ingresos', data: ingresos, borderRadius: 6, order: 2 },
        { label: 'Egresos',  data: egresos,  borderRadius: 6, order: 2 },
        { type: 'line', label: 'Neto', data: neto, yAxisID: 'y1', tension: .2, pointRadius: 2, order: 1 }
      ]
    };
  }

  barCajaSesData: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  barCajaSesOpts: ChartOptions<'bar' | 'line'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar' | 'line'>) => {
        const lbl = c.dataset.label || ''; const val = Number((c.parsed as any).y || 0);
        return lbl.toLowerCase().includes('egres') ? `${lbl}: -${this.money(val)}` : `${lbl}: ${this.money(val)}`;
      } } } },
    scales: {
      x: { stacked: false, title: { display: true, text: 'Día de cierre' } },
      y: { stacked: false, beginAtZero: true, title: { display: true, text: 'Q (quetzales)' },
           ticks: { callback: v => this.money(Number(v as number)) } },
      y1: { position: 'right', grid: { drawOnChartArea: false },
            ticks: { callback: v => this.money(Number(v as number)) } }
    }
  };
  private buildCajaSesionesChart() {
    const groups   = this.cajaSesionesAgrupadas;
    const labels   = groups.map(g => g.dia);
    const inicial  = groups.map(g => Number(g.totInicial || 0));
    const ingresos = groups.map(g => Number(g.totIng     || 0));
    const egresos  = groups.map(g => Number(g.totEgr     || 0));
    const neto     = groups.map(g => Number(g.totNeto    || 0));
    this.barCajaSesData = {
      labels,
      datasets: [
        { label: 'Inicial',  data: inicial,  borderRadius: 6, order: 2 },
        { label: 'Ingresos', data: ingresos, borderRadius: 6, order: 2 },
        { label: 'Egresos',  data: egresos,  borderRadius: 6, order: 2 },
        { type: 'line', label: 'Neto', data: neto, yAxisID: 'y1', tension: .2, pointRadius: 2, order: 1 }
      ]
    };
  }

  // Utilidad por producto
  barUtilidadData: ChartData<'bar'> = { labels: [], datasets: [] };
  barUtilidadOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' },
      tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `${c.dataset.label}: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Producto' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildUtilidadChart(){
    const rows = [...this.porUtilidad].sort((a,b)=>Number(b.utilidad)-Number(a.utilidad));
    const top = rows.slice(0, TOP_N);
    const resto = rows.slice(TOP_N).reduce((a,b)=>a+Number(b.utilidad||0),0);
    const labels = top.map(x=>x.producto);
    const util = top.map(x=>Number(x.utilidad||0));
    if (resto>0){ labels.push('Otros'); util.push(resto); }
    this.barUtilidadData = { labels, datasets:[{ label:'Utilidad', data: util, borderRadius:6 }] };
  }

  // ====== Pedidos: gráficos ======
  barPedFpData: ChartData<'bar'> = { labels: [], datasets: [] };
  barPedFpOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' },
      tooltip:{ callbacks:{ label:(c: TooltipItem<'bar'>)=> `${c.dataset.label}: ${this.money(Number(c.parsed.y))}` } } },
    scales:{
      x:{ title:{ display:true, text:'Forma de pago' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' }, ticks:{ callback:v=>this.money(Number(v as number)) } }
    }
  };
  private buildPedFpChart(){
    const rows = this.pedFp?.filas || [];
    const labels = rows.map(x=>x.formaPago);
    const data = rows.map(x=>Number(x.neto||0));
    this.barPedFpData = { labels, datasets:[{ label:'Neto', data, borderRadius:6 }] };
  }

  barPedEstadosData: ChartData<'bar'> = { labels: [], datasets: [] };
  barPedEstadosOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' } },
    scales:{
      x:{ title:{ display:true, text:'Estado' }, ticks:{ autoSkip:false } },
      y:{ beginAtZero:true, title:{ display:true, text:'Q (quetzales)' } }
    }
  };
  private buildPedEstadosChart(){
    const rows = this.pedEstados || [];
    this.barPedEstadosData = {
      labels: rows.map(x=>this.estadoLabel((x as any).estado)),
      datasets: [{ label:'Total', data: rows.map(x=>Number((x as any).total || 0)), borderRadius:6 }]
    };
  }

  barPedTopData: ChartData<'bar'> = { labels: [], datasets: [] };
  barPedTopOpts: ChartOptions<'bar'> = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'top' } },
    scales:{ x:{ title:{ display:true, text:'Producto' }, ticks:{ autoSkip:false } },
             y:{ beginAtZero:true, title:{ display:true, text:'Cantidad' } } }
  };
  private buildPedTopChart(){
    const rows = this.pedTop || [];
    this.barPedTopData = {
      labels: rows.map(x=>x.presentacion || ''),
      datasets: [{ label:'Cantidad', data: rows.map(x=>x.cantidad), borderRadius:6 }]
    };
  }
}
