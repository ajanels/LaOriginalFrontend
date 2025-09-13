import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import {
  PedidosService,
  ProveedorLite,
  PedidoListItem,
  PedidoFull,
  PedidoDetalleCreate,
  PedidoCreate,
  RecepcionCreate,
  EstadoPedidoProveedor
} from '../../../services/pedidos.service';

@Component({
  selector: 'app-pedidos-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrls: ['./proveedores.css']
})
export class Proveedores implements OnInit, OnDestroy {

  private svc = inject(PedidosService);

  // ===== Data principal =====
  pedidos: PedidoListItem[] = [];
  pedidosFiltrados: PedidoListItem[] = [];
  proveedoresOpts: ProveedorLite[] = [];

  // UI
  cargando = false;
  mensaje = '';
  errorMsg = '';
  // lista / filtros
  searchTerm = '';
  filtroProveedorId: number | null = null;
  filtroEstado = '';
  filtroDesde: string | null = null;
  filtroHasta: string | null = null;

  // Paginación
  itemsPorPagina = 10;
  paginaActual = 0;
  inicio = 0;
  fin = 10;
  totalPaginas = 1;
  private searchTimer: any;

  // ===== Crear =====
  mostrarCrear = false;
  submittedCrear = false;
  guardandoCrear = false;
  formCrearPedido: Omit<PedidoCreate, 'detalles'> & { detalles: PedidoDetalleCreate[] } = {
    proveedorId: null as any,
    numero: '',
    observaciones: '',
    detalles: []
  };
  lineaTmp: PedidoDetalleCreate & { notas?: string | null } = {
    presentacionId: null as any,
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    notas: ''
  };

  // ===== Detalle / edición =====
  mostrarDetalle = false;
  pedidoActual: PedidoFull | null = null;
  pedidoEdit: { numero: string | null; observaciones: string | null } = { numero: null, observaciones: null };

  // Línea en edición (dentro del detalle)
  editandoLinea: { id: number } | null = null;
  lineaForm: PedidoDetalleCreate & { notas?: string | null } = {
    presentacionId: null as any, cantidad: 1, precioUnitario: 0, descuento: 0, notas: ''
  };

  // ===== Recepción =====
  mostrarRecepcion = false;
  recForm: { fecha: string; numero: string | null; formaPagoId: number | null } = {
    fecha: new Date().toISOString().slice(0,10),
    numero: null,
    formaPagoId: null
  };

  // Estados para filtros
  estados = [
    { value: 'borrador' as EstadoPedidoProveedor, label: 'Borrador' },
    { value: 'enviado' as EstadoPedidoProveedor, label: 'Enviado' },
    { value: 'aprobado' as EstadoPedidoProveedor, label: 'Aprobado' },
    { value: 'parcialmenteRecibido' as EstadoPedidoProveedor, label: 'Parcialmente recibido' },
    { value: 'cerrado' as EstadoPedidoProveedor, label: 'Cerrado' },
    { value: 'cancelado' as EstadoPedidoProveedor, label: 'Cancelado' }
  ];

  // Toast
  private Toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:2500, timerProgressBar:true });

  ngOnInit(): void {
    this.cargarProveedores();
    this.cargarPedidos();
  }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape') onEsc(){ if (this.mostrarCrear) this.cerrarCrear(); if (this.mostrarDetalle) this.cerrarDetalle(); if (this.mostrarRecepcion) this.cerrarRecepcion(); }

  /* ===================== LISTA ===================== */
  cargarProveedores(): void {
    this.svc.listProveedores().subscribe({
      next: (ps) => this.proveedoresOpts = ps ?? [],
      error: () => {}
    });
  }

  cargarPedidos(): void {
    this.cargando = true;
    this.svc.list().subscribe({
      next: (data) => {
        this.pedidos = data ?? [];
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar los pedidos.');
        this.cargando = false;
      }
    });
  }

  estadoTexto(e?: EstadoPedidoProveedor | null): string {
    switch (e) {
      case 'borrador': return 'Borrador';
      case 'enviado': return 'Enviado';
      case 'aprobado': return 'Aprobado';
      case 'parcialmenteRecibido': return 'Parcialmente recibido';
      case 'cerrado': return 'Cerrado';
      case 'cancelado': return 'Cancelado';
      default: return '—';
    }
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let arr = [...this.pedidos];
    const term = (this.searchTerm || '').trim().toLowerCase();

    if (term) {
      arr = arr.filter(p =>
        (p.numero || '').toLowerCase().includes(term) ||
        (p.proveedorNombre || '').toLowerCase().includes(term)
      );
    }
    if (this.filtroProveedorId) {
      arr = arr.filter(p => p.proveedorId === this.filtroProveedorId);
    }
    if (this.filtroEstado) {
      arr = arr.filter(p => p.estado === (this.filtroEstado as EstadoPedidoProveedor));
    }
    if (this.filtroDesde) {
      const d = new Date(this.filtroDesde + 'T00:00:00');
      arr = arr.filter(p => new Date(p.fecha) >= d);
    }
    if (this.filtroHasta) {
      const h = new Date(this.filtroHasta + 'T23:59:59');
      arr = arr.filter(p => new Date(p.fecha) <= h);
    }

    this.pedidosFiltrados = arr;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.pedidosFiltrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0){ this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1){ this.paginaActual++; this.actualizarPaginacion(); } }

  /* ===================== CREAR ===================== */
  abrirCrear(): void {
    this.formCrearPedido = { proveedorId: null as any, numero: '', observaciones: '', detalles: [] };
    this.lineaTmp = { presentacionId: null as any, cantidad: 1, precioUnitario: 0, descuento: 0, notas: '' };
    this.submittedCrear = false;
    this.mostrarCrear = true;
  }
  cerrarCrear(): void { this.mostrarCrear = false; }

  agregarLineaTmp(): void {
    const l = this.lineaTmp;
    if (!l.presentacionId || l.cantidad <= 0) { this.Toast.fire({icon:'warning', title:'Completa la presentación y cantidad'}); return; }
    this.formCrearPedido.detalles.push({
      presentacionId: l.presentacionId,
      cantidad: +l.cantidad,
      precioUnitario: +l.precioUnitario,
      descuento: +l.descuento || 0,
      notas: (l.notas || '').trim() || null
    });
    this.lineaTmp = { presentacionId: null as any, cantidad: 1, precioUnitario: 0, descuento: 0, notas: '' };
  }
  quitarLineaTmp(i:number): void { this.formCrearPedido.detalles.splice(i,1); }

  crearPedido(): void {
    this.submittedCrear = true;
    const body: PedidoCreate = {
      proveedorId: this.formCrearPedido.proveedorId!,
      numero: (this.formCrearPedido.numero || '').trim() || null,
      observaciones: (this.formCrearPedido.observaciones || '').trim() || null,
      detalles: this.formCrearPedido.detalles
    };
    if (!body.proveedorId){ this.Toast.fire({icon:'warning', title:'Selecciona proveedor'}); return; }
    if (!body.detalles.length){ this.Toast.fire({icon:'warning', title:'Agrega al menos una línea'}); return; }

    this.guardandoCrear = true;
    this.svc.create(body).subscribe({
      next: (r) => {
        this.Toast.fire({icon:'success', title:`Pedido #${r.id} creado`});
        this.guardandoCrear = false;
        this.mostrarCrear = false;
        this.cargarPedidos();
      },
      error: () => {
        this.guardandoCrear = false;
        this.swalError('No se pudo crear el pedido');
      }
    });
  }

  /* ===================== DETALLE ===================== */
  abrirDetalle(id: number): void {
    this.svc.getById(id).subscribe({
      next: (p) => {
        this.pedidoActual = p;
        this.pedidoEdit = { numero: p.numero, observaciones: p.observaciones };
        this.editandoLinea = null;
        this.lineaForm = { presentacionId: null as any, cantidad: 1, precioUnitario: 0, descuento: 0, notas: '' };
        this.mostrarDetalle = true;
      },
      error: () => this.swalError('No se pudo cargar el pedido')
    });
  }
  cerrarDetalle(): void { this.mostrarDetalle = false; this.pedidoActual = null; this.editandoLinea = null; }

  // guardar encabezado (solo borrador)
  guardarEncabezado(): void {
    if (!this.pedidoActual || this.pedidoActual.estado!=='borrador') return;
  }

  editarLinea(d: PedidoFull['detalles'][number]): void {
    this.editandoLinea = { id: d.id };
    this.lineaForm = {
      presentacionId: d.presentacionId,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      descuento: d.descuento,
      notas: d.notas || ''
    };
  }

  eliminarLinea(d: PedidoFull['detalles'][number]): void {
    if (!this.pedidoActual) return;
    Swal.fire({ title:'¿Eliminar línea?', icon:'warning', showCancelButton:true, confirmButtonText:'Sí, eliminar', confirmButtonColor:'#d33' })
      .then(res => {
        if (!res.isConfirmed) return;
        this.svc.deleteLinea(this.pedidoActual!.id, d.id).subscribe({
          next: () => this.abrirDetalle(this.pedidoActual!.id),
          error: () => this.swalError('No se pudo eliminar la línea')
        });
      });
  }

  guardarLinea(): void {
  if (!this.pedidoActual) return;

  const id = this.pedidoActual.id;
  const body: PedidoDetalleCreate = {
    presentacionId: this.lineaForm.presentacionId!,
    cantidad: +this.lineaForm.cantidad,
    precioUnitario: +this.lineaForm.precioUnitario,
    descuento: +this.lineaForm.descuento || 0,
    notas: (this.lineaForm.notas || '').trim() || null
  };

  if (!body.presentacionId || body.cantidad <= 0) {
    this.Toast.fire({ icon: 'warning', title: 'Completa presentación y cantidad' });
    return;
  }

  const onOk = () => {
    this.Toast.fire({ icon: 'success', title: this.editandoLinea ? 'Línea actualizada' : 'Línea agregada' });
    this.editandoLinea = null;
    this.lineaForm = { presentacionId: null as any, cantidad: 1, precioUnitario: 0, descuento: 0, notas: '' };
    this.abrirDetalle(id);
  };
  const onErr = () => this.swalError('No se pudo guardar la línea');

  if (this.editandoLinea) {
    this.svc.updateLinea(id, this.editandoLinea.id, body).subscribe({ next: onOk, error: onErr });
  } else {
    this.svc.addLinea(id, body).subscribe({ next: onOk, error: onErr });
  }
}


  /* ===================== WORKFLOW ===================== */
  enviar(p: PedidoListItem | PedidoFull): void {
    Swal.fire({ title:'¿Enviar pedido?', text:`#${p.id}`, icon:'question', showCancelButton:true })
      .then(r => {
        if (!r.isConfirmed) return;
        this.svc.enviar(p.id).subscribe({
          next: () => { this.Toast.fire({icon:'success', title:'Pedido enviado'}); this.cargarPedidos(); if (this.mostrarDetalle) this.abrirDetalle(p.id); },
          error: (e) => this.swalError(e?.error ?? 'No se pudo enviar')
        });
      });
  }

  aprobar(p: PedidoListItem | PedidoFull): void {
    Swal.fire({ title:'¿Aprobar pedido?', text:`#${p.id}`, icon:'question', showCancelButton:true })
      .then(r => {
        if (!r.isConfirmed) return;
        this.svc.aprobar(p.id).subscribe({
          next: () => { this.Toast.fire({icon:'success', title:'Pedido aprobado'}); this.cargarPedidos(); if (this.mostrarDetalle) this.abrirDetalle(p.id); },
          error: (e) => this.swalError(e?.error ?? 'No se pudo aprobar')
        });
      });
  }

  cancelar(p: PedidoListItem | PedidoFull): void {
    Swal.fire({ title:'¿Cancelar pedido?', text:`#${p.id}`, icon:'warning', showCancelButton:true, confirmButtonColor:'#d33' })
      .then(r => {
        if (!r.isConfirmed) return;
        this.svc.cancelar(p.id).subscribe({
          next: () => { this.Toast.fire({icon:'success', title:'Pedido cancelado'}); this.cargarPedidos(); if (this.mostrarDetalle) this.abrirDetalle(p.id); },
          error: (e) => this.swalError(e?.error ?? 'No se pudo cancelar')
        });
      });
  }

  /* ===================== RECEPCIÓN ===================== */
  abrirRecepcion(): void {
    if (!this.pedidoActual) return;
    this.pedidoActual.detalles.forEach(d => {
      const pendiente = Math.max(0, d.cantidad - d.cantidadRecibida);
      d._recibir = pendiente > 0 ? pendiente : 0;
      d._costo = d.precioUnitario;
      d._notas = null;
    });
    this.recForm = { fecha: new Date().toISOString().slice(0,10), numero: null, formaPagoId: null };
    this.mostrarRecepcion = true;
  }
  cerrarRecepcion(): void { this.mostrarRecepcion = false; }

  confirmarRecepcion(): void {
    if (!this.pedidoActual) return;
    const lineas = this.pedidoActual.detalles
      .filter(d => (d._recibir ?? 0) > 0)
      .map(d => ({
        pedidoProveedorDetalleId: d.id,
        cantidad: +(d._recibir as number),
        costoUnitario: +(d._costo ?? 0),
        notas: (d._notas || '').toString().trim() || null
      }));
    if (!lineas.length){ this.Toast.fire({icon:'warning', title:'No hay cantidades a recibir'}); return; }

    const body: RecepcionCreate = {
      fecha: this.recForm.fecha,
      numero: (this.recForm.numero || '').trim() || null,
      formaPagoId: this.recForm.formaPagoId ?? null,
      lineas
    };
    this.svc.recepcion(this.pedidoActual.id, body).subscribe({
      next: () => {
        this.Toast.fire({icon:'success', title:'Recepción registrada'});
        this.mostrarRecepcion = false;
        this.abrirDetalle(this.pedidoActual!.id);
        this.cargarPedidos();
      },
      error: (e) => this.swalError(e?.error ?? 'No se pudo registrar la recepción')
    });
  }

  /* ===================== Utils ===================== */
  private swalError(text: string): void { Swal.fire({ icon:'error', title:'Ups…', text }); }
}
