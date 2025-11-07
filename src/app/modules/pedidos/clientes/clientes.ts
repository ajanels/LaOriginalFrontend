import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import {
  PedidosClientesService,
  PedidoClienteListDto,
  PedidoClienteCreateDto,
  PedidoClienteDetailDto,
  TipoPedidoCliente,
  CatalogItemDto,
} from '../../../services/pedidos-clientes.service';
import { CategoriasService, Categoria } from '../../../services/categorias.service';
import { FormasPagoService, FormaPagoItem } from '../../../services/formas-pago.service';
import { ClientesService, Cliente } from '../../../services/clientes.service';
import { VentasService } from '../../../services/ventas.service';

enum EstadoPedidoCliente {
  Borrador = 0,
  Confirmado = 1,
  EnPreparacion = 2,
  Listo = 3,
  Entregado = 4,
  Cancelado = 9
}

type LineForm = {
  presentacionId: number;
  presentacionNombre: string;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  totalLinea: number;
  stock?: number | null;
  disponible?: number | null;
  imgUrl?: string | null;
  productoNombre?: string | null;
};

@Component({
  selector: 'app-pedidos-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrls: ['./clientes.css'],
})
export class PedidosClientesComponent implements OnInit {
  EstadoPedidoCliente = EstadoPedidoCliente;
  TipoPedidoCliente = TipoPedidoCliente;

  private svc = inject(PedidosClientesService);
  private formasSvc = inject(FormasPagoService);
  private clientesSvc = inject(ClientesService);
  private catSvc = inject(CategoriasService);
  private invSvc = inject(VentasService);

  categorias = signal<Categoria[]>([]);
  catSelected = signal<number | null>(null);
  catPopover  = signal(false);

  private presCache = new Map<number, { imgUrl: string | null; productoNombre: string | null }>();

  editingId: number | null = null;

  loading = signal(false);
  q = signal<string>('');
  pedidos = signal<PedidoClienteListDto[]>([]);

  // ====== NUEVO: Vista (activos / entregados) + paginación ======
  view = signal<'activos' | 'entregados'>('activos');
  page = signal<number>(0);
  pageSize = signal<number>(8); 

  /** Lista filtrada por búsqueda (todas las filas) */
  filteredAll = computed(() => {
    const term = this.q().trim().toLowerCase();
    const rows = this.pedidos();
    if (!term) return rows;
    return rows.filter(p =>
      (p.cliente || '').toLowerCase().includes(term) ||
      (p.descripcion || '').toLowerCase().includes(term)
    );
  });

  /** Separación por estado */
  activos = computed(() =>
    this.filteredAll().filter(p => Number(p.estado) !== EstadoPedidoCliente.Entregado)
  );
  entregados = computed(() =>
    this.filteredAll().filter(p => Number(p.estado) === EstadoPedidoCliente.Entregado)
  );

  /** Lista según vista actual */
  listForView = computed(() =>
    this.view() === 'activos' ? this.activos() : this.entregados()
  );

  total = computed(() => this.listForView().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  paged = computed(() => {
    const list = this.listForView();
    const size = this.pageSize();
    const lastIndex = Math.max(0, this.totalPages() - 1);
    const page = Math.min(this.page(), lastIndex);
    const start = page * size;
    return list.slice(start, start + size);
  });

  rangeStart = computed(() => this.total() ? this.page() * this.pageSize() + 1 : 0);
  rangeEnd   = computed(() => Math.min(this.total(), (this.page() + 1) * this.pageSize()));
  canPrev    = computed(() => this.page() > 0);
  canNext    = computed(() => this.page() < this.totalPages() - 1);

  goActivos()     { if (this.view() !== 'activos')     { this.view.set('activos'); this.page.set(0); } }
  goEntregados()  { if (this.view() !== 'entregados')  { this.view.set('entregados'); this.page.set(0); } }
  prev()          { if (this.canPrev()) this.page.set(this.page() - 1); }
  next()          { if (this.canNext()) this.page.set(this.page() + 1); }

  // ====== Modales
  showChoice = signal(false);
  showFull   = signal(false);
  showPago   = signal(false);
  showDetail = signal(false);
  showDevolucion = signal(false);

  // Personalizado + catálogo
  showPers = signal(false);
  showCat  = signal(false);

  private loadingDetail = false;

  showNewClient = signal(false);
  savingNewClient = signal(false);
  newClient = { nombre: '', telefono: '' };

  detalle: PedidoClienteDetailDto | null = null;

  clienteTerm = signal(''); clientesSug = signal<Cliente[]>([]); clientesLoading = signal(false);

  // Form “Completo”
  form = {
    clienteId: null as number | null,
    clienteNombre: '',
    telefono: '',
    direccion: '',
    fechaEntrega: '' as string | '',
    estado: EstadoPedidoCliente.Borrador as number,
    totalManual: 0,
    diseno: { lienzos: 0, color: '', brich: false, otros: '' },
    reportado: null as null | boolean,
    observacionesExtra: '',
  };

  // Form “Personalizado”
  formPers = {
    clienteId: null as number | null,
    clienteNombre: '',
    telefono: '',
    direccion: '',
    fechaEntrega: '' as string | '',
    estado: EstadoPedidoCliente.Borrador as number,
    observaciones: '',
    diseno: { lienzos: 0, color: '', brich: false, otros: '' },
    reportado: null as null | boolean,
    observacionesExtra: '',
    detalles: [] as LineForm[],
    subtotal: 0,
    descuento: 0,
    total: 0,
  };

  // Catálogo
  catTerm = signal(''); catLoading = false; catRows = signal<CatalogItemDto[]>([]); catTake = 30;

  private norm = (s: any) =>
    String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  catSelectedName = computed(() => {
    const id = this.catSelected();
    if (id == null) return '';
    return this.categorias().find(c => c.id === id)?.nombre || '';
  });

  catRowsFiltered = computed(() => {
    const rows = this.catRows();
    const selId = this.catSelected();
    if (selId == null) return rows;

    const selName = (this.categorias().find(c => c.id === selId)?.nombre || '')
      .toString().trim().toLowerCase();

    const hasCatInfo = rows.some((r: any) =>
      r?.categoriaId != null ||
      r?.productoCategoriaId != null ||
      r?.catId != null ||
      (r?.categoria || r?.productoCategoria || r?.catNombre)
    );

    if (!hasCatInfo) return rows;

    return rows.filter((r: any) => {
      const cid = r?.categoriaId ?? r?.productoCategoriaId ?? r?.catId;
      if (cid != null) return +cid === +selId;

      const rName = (r?.categoria ?? r?.productoCategoria ?? r?.catNombre ?? '')
        .toString().trim().toLowerCase();

      return !!selName && rName === selName;
    });
  });

  pedidoCreadoId: number | null = null;

  formasPago = signal<FormaPagoItem[]>([]);
  anticipo = { formaPagoId: null as number | null, monto: 0, referencia: '', notas: '' };

  devolPedidoId: number | null = null;
  devol = { formaPagoId: null as number | null, monto: 0, referencia: '', notas: '' };
  devolSaldoDisponible = signal<number>(0);

  // ====== INIT
  ngOnInit(): void {
    this.reload();
    this.formasSvc.list(true).subscribe({
      next: rows => this.formasPago.set(rows || []),
      error: () => {}
    });

    // Resetear página cuando cambian vista, búsqueda o la lista
    effect(() => { const _ = [this.view(), this.q(), this.pedidos()]; this.page.set(0); });
  }

  // ====== DATA
  reload(): void {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: rows => { this.pedidos.set(rows || []); this.loading.set(false); this.page.set(0); },
      error: (e: any) => { this.loading.set(false); this.swalErrorFrom(e, 'No se pudo cargar los pedidos'); }
    });
  }

  // ===== Helpers de UI existentes =====
  trackByPedidoId = (_: number, it: PedidoClienteListDto) => it.id;
  trackByCatId = (_: number, it: CatalogItemDto) => it.id;

  estadoBadge(estado: string | number) {
    const k = Number(estado);
    return {
      pill: true,
      borrador:     k === EstadoPedidoCliente.Borrador,
      confirmado:   k === EstadoPedidoCliente.Confirmado,
      preparacion:  k === EstadoPedidoCliente.EnPreparacion,
      listo:        k === EstadoPedidoCliente.Listo,
      entregado:    k === EstadoPedidoCliente.Entregado,
      cancelado:    k === EstadoPedidoCliente.Cancelado
    };
  }
  estadoTexto(estado: string | number) {
    const k = Number(estado);
    switch (k) {
      case EstadoPedidoCliente.Borrador: return 'Borrador';
      case EstadoPedidoCliente.Confirmado: return 'Confirmado';
      case EstadoPedidoCliente.EnPreparacion: return 'En preparación';
      case EstadoPedidoCliente.Listo: return 'Listo';
      case EstadoPedidoCliente.Entregado: return 'Entregado';
      case EstadoPedidoCliente.Cancelado: return 'Cancelado';
      default: return '—';
    }
  }

  showBtnConvertirVenta = (_: PedidoClienteListDto) => false;

  isFinalizado(p: PedidoClienteListDto): boolean {
    const est = Number(p.estado);
    const any: any = p as any;
    const tieneVenta = !!(any.ventaId ?? any.convertidoAVenta ?? any.esVenta ?? false);
    return est === EstadoPedidoCliente.Entregado || tieneVenta;
  }

  crearPedido(): void { this.showChoice.set(true); }
  closeCreate() { this.showChoice.set(false); }

  goCrear(tipo: 'completo'|'personalizado') {
    this.showChoice.set(false);
    if (tipo === 'completo') { this.editingId = null; this.resetFull(); this.showFull.set(true); }
    else { this.editingId = null; this.resetPers(); this.showPers.set(true); }
  }

  closeFull() { this.showFull.set(false); this.editingId = null; }
  closePers() { this.showPers.set(false); this.editingId = null; }

  private sanitizePhone(v: any): string { return String(v ?? '').replace(/\D/g, '').slice(0, 8); }
  onPedidoPhoneChange(v: any) { this.form.telefono = this.sanitizePhone(v); }
  onNewClientPhoneChange(v: any) { this.newClient.telefono = this.sanitizePhone(v); }
  onPersPhoneChange(v: any) { this.formPers.telefono = this.sanitizePhone(v); }

  buscarClientes(): void {
    const term = this.clienteTerm().trim();
    this.clientesSug.set([]);
    if (term.length < 2) return;

    this.clientesLoading.set(true);
    this.clientesSvc.list(true, term, 8).subscribe({
      next: rows => { this.clientesSug.set(rows || []); this.clientesLoading.set(false); },
      error: () => { this.clientesLoading.set(false); }
    });
  }

  pickCliente(c: Cliente): void {
    this.form.clienteId = c.id;
    this.form.clienteNombre = c.nombre;
    this.form.telefono = c.telefono ? this.sanitizePhone(c.telefono) : '';
    this.form.direccion = c.direccion ?? '';

    this.formPers.clienteId = c.id;
    this.formPers.clienteNombre = c.nombre;
    this.formPers.telefono = c.telefono ? this.sanitizePhone(c.telefono) : '';
    this.formPers.direccion = c.direccion ?? '';

    this.clienteTerm.set(c.nombre);
    this.clientesSug.set([]);
  }

  clearCliente(): void {
    this.form.clienteId = null;
    this.form.clienteNombre = '';
    this.formPers.clienteId = null;
    this.formPers.clienteNombre = '';
    this.clienteTerm.set('');
    this.clientesSug.set([]);
  }

  openNewClient() {
    this.newClient = { nombre: (this.clienteTerm() || '').trim(), telefono: '' };
    this.showNewClient.set(true);
  }
  closeNewClient() { this.showNewClient.set(false); this.savingNewClient.set(false); }
  saveNewClient() {
    const nombre = (this.newClient.nombre || '').trim();
    const telefono = this.sanitizePhone(this.newClient.telefono);
    if (!nombre) { Swal.fire('Falta nombre', 'Ingresa el nombre del cliente.', 'warning'); return; }
    if (telefono && telefono.length !== 8) { Swal.fire('Teléfono inválido', 'El teléfono debe tener 8 dígitos.', 'warning'); return; }
    this.savingNewClient.set(true);
    this.clientesSvc.create({
      nombre, nit: null, telefono: telefono || null, email: null, direccion: null, notas: null, activo: true
    }).subscribe({
      next: cli => {
        this.form.clienteId = cli.id; this.form.clienteNombre = cli.nombre; this.form.telefono = this.sanitizePhone(cli.telefono ?? '');
        this.formPers.clienteId = cli.id; this.formPers.clienteNombre = cli.nombre; this.formPers.telefono = this.sanitizePhone(cli.telefono ?? '');
        this.clienteTerm.set(cli.nombre); this.clientesSug.set([]);
        this.savingNewClient.set(false); this.showNewClient.set(false);
        Swal.fire('Cliente creado', 'Se agregó el cliente y quedó seleccionado.', 'success');
      },
      error: (e: any) => { this.savingNewClient.set(false); this.swalErrorFrom(e, 'No se pudo crear el cliente'); }
    });
  }

  private makeUtcIsoFromDateInput(v: string | ''): string | undefined {
    if (!v) return undefined;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(Date.UTC(y, m - 1, d)).toISOString();
  }

  private buildDesignNotes() {
    const d = this.form.diseno;
    const parts: string[] = [];
    if (d.lienzos) parts.push(`Lienzos: ${d.lienzos}`);
    if (d.color)   parts.push(`Color: ${d.color}`);
    if (d.brich)   parts.push('Brich: sí');
    if (d.otros)   parts.push(d.otros);
    const rep = this.form.reportado == null ? '' : `Reportado: ${this.form.reportado ? 'sí' : 'no'}`;
    const obsExtra = (this.form.observacionesExtra || '').trim();
    return [parts.join(' · '), rep, obsExtra].filter(Boolean).join(' | ').slice(0, 400);
  }

  private buildDesignNotesPers() {
    const d = this.formPers.diseno;
    const parts: string[] = [];
    if (d.lienzos) parts.push(`Lienzos: ${d.lienzos}`);
    if (d.color)   parts.push(`Color: ${d.color}`);
    if (d.brich)   parts.push('Brich: sí');
    if (d.otros)   parts.push(d.otros);
    const rep = this.formPers.reportado == null ? '' : `Reportado: ${this.formPers.reportado ? 'sí' : 'no'}`;
    const obsExtra = (this.formPers.observacionesExtra || '').trim();
    return [parts.join(' · '), rep, obsExtra].filter(Boolean).join(' | ').slice(0, 400);
  }

  obsLines(obs?: string | null): string[] {
    if (!obs) return [];
    return obs.split('|').flatMap(p => p.split('·')).map(s => s.trim()).filter(Boolean);
  }

  saveFull(): void {
    if (!this.form.clienteId || !this.form.clienteNombre.trim()) { Swal.fire('Falta cliente', 'Selecciona un cliente o crea uno nuevo.', 'warning'); return; }
    const tel = this.sanitizePhone(this.form.telefono);
    if (tel && tel.length !== 8) { Swal.fire('Teléfono inválido', 'El teléfono debe tener 8 dígitos.', 'warning'); return; }

    const total = Number(this.form.totalManual) || 0;
    if (total < 0) { Swal.fire('Monto inválido', 'El total no puede ser negativo.', 'warning'); return; }

    const estadoSeguro = Number.isFinite(+this.form.estado) ? +this.form.estado : EstadoPedidoCliente.Borrador;

    const dto: PedidoClienteCreateDto = {
      clienteId: this.form.clienteId!,
      clienteNombre: this.form.clienteNombre.trim(),
      telefono: tel || undefined,
      direccionEntrega: this.form.direccion || undefined,
      fechaEntregaCompromisoUtc: this.makeUtcIsoFromDateInput(this.form.fechaEntrega),
      estado: estadoSeguro,
      tipo: TipoPedidoCliente.Completo,
      observaciones: this.buildDesignNotes() || undefined,
      subtotal: 0,
      descuento: 0,
      total: +total.toFixed(2),
      detalles: [],
      diseno: {
        lienzos: Number(this.form.diseno.lienzos) || 0,
        color: (this.form.diseno.color || '').trim() || null,
        brich: !!this.form.diseno.brich,
        otros: (this.form.diseno.otros || '').trim() || null,
        reportado: this.form.reportado,
        extra: (this.form.observacionesExtra || '').trim() || null
      }
    };

    if (this.editingId) {
      this.svc.update(this.editingId, dto).subscribe({
        next: () => { this.showFull.set(false); this.editingId = null; Swal.fire('Listo', 'Pedido actualizado.', 'success'); this.reload(); },
        error: (e: any) => this.swalErrorFrom(e, 'No se pudo actualizar el pedido')
      });
      return;
    }

    this.svc.create(dto).subscribe({
      next: (res: any) => { this.pedidoCreadoId = res?.id ?? res?.Id ?? null; this.showFull.set(false); Swal.fire('Pedido creado', 'Se guardó en borrador.', 'success'); this.reload(); },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo crear el pedido')
    });
  }

  savePers(): void {
    if (!this.formPers.clienteId || !this.formPers.clienteNombre.trim()) { Swal.fire('Falta cliente', 'Selecciona un cliente o crea uno nuevo.', 'warning'); return; }
    const tel = this.sanitizePhone(this.formPers.telefono);
    if (tel && tel.length !== 8) { Swal.fire('Teléfono inválido', 'El teléfono debe tener 8 dígitos.', 'warning'); return; }
    if (this.formPers.detalles.length === 0) { Swal.fire('Faltan ítems', 'El pedido personalizado debe tener al menos un ítem.', 'warning'); return; }

    this.recalcPersTotals();

    const dto: PedidoClienteCreateDto = {
      clienteId: this.formPers.clienteId!,
      clienteNombre: this.formPers.clienteNombre.trim(),
      telefono: tel || undefined,
      direccionEntrega: this.formPers.direccion || undefined,
      fechaEntregaCompromisoUtc: this.makeUtcIsoFromDateInput(this.formPers.fechaEntrega),
      estado: Number.isFinite(+this.formPers.estado) ? +this.formPers.estado : EstadoPedidoCliente.Borrador,
      tipo: TipoPedidoCliente.Personalizado,
      observaciones: this.buildDesignNotesPers() || undefined,
      subtotal: this.formPers.subtotal,
      descuento: this.formPers.descuento,
      total: this.formPers.total,
      detalles: this.formPers.detalles.map(l => ({
        id: undefined,
        presentacionId: l.presentacionId,
        presentacionNombre: l.presentacionNombre,
        cantidad: +(+l.cantidad).toFixed(2),
        precioUnitario: +(+l.precioUnitario).toFixed(2),
        descuentoUnitario: +(+l.descuentoUnitario).toFixed(2),
        totalLinea: +(+l.totalLinea).toFixed(2),
        notas: null
      })),
      diseno: {
        lienzos: Number(this.formPers.diseno.lienzos) || 0,
        color: (this.formPers.diseno.color || '').trim() || null,
        brich: !!this.formPers.diseno.brich,
        otros: (this.formPers.diseno.otros || '').trim() || null,
        reportado: this.formPers.reportado,
        extra: (this.formPers.observacionesExtra || '').trim() || null
      }
    };

    if (this.editingId) {
      this.svc.update(this.editingId, dto).subscribe({
        next: () => { this.showPers.set(false); this.editingId = null; Swal.fire('Listo', 'Pedido actualizado.', 'success'); this.reload(); },
        error: (e: any) => this.swalErrorFrom(e, 'No se pudo actualizar el pedido')
      });
    } else {
      this.svc.create(dto).subscribe({
        next: (res: any) => { this.pedidoCreadoId = res?.id ?? res?.Id ?? null; this.showPers.set(false); Swal.fire('Pedido creado', 'Se guardó en borrador.', 'success'); this.reload(); },
        error: (e: any) => this.swalErrorFrom(e, 'No se pudo crear el pedido')
      });
    }
  }

  openAnticipo(): void {
    if (!this.pedidoCreadoId) { this.reload(); Swal.fire('Listo', 'Pedido creado.', 'success'); return; }
    this.anticipo.monto = 0; this.anticipo.formaPagoId = null; this.anticipo.referencia = ''; this.anticipo.notas = '';
    this.showPago.set(true);
  }

  openAnticipoDesdeLista(id: number) {
    this.svc.getById(id).subscribe({
      next: d => {
        if (d.saldo <= 0) { Swal.fire('Pagado', 'Este pedido ya está completamente pagado.', 'info'); return; }
        this.pedidoCreadoId = id;
        this.anticipo.monto = d.saldo;
        this.anticipo.formaPagoId = null;
        this.anticipo.referencia = '';
        this.anticipo.notas = '';
        this.showPago.set(true);
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo abrir el anticipo')
    });
  }

  closePago() { this.showPago.set(false); this.pedidoCreadoId = null; this.reload(); }

  registrarAnticipo(): void {
    if (!this.pedidoCreadoId) return;

    const fp = this.formasPago().find(f => f.id === this.anticipo.formaPagoId);
    if (!fp) { Swal.fire('Falta forma de pago', 'Selecciona una forma de pago.', 'warning'); return; }
    if (!this.anticipo.monto || this.anticipo.monto <= 0) { Swal.fire('Monto inválido', 'Ingresa un monto válido.', 'warning'); return; }
    if (fp.requiereReferencia && !this.anticipo.referencia.trim()) {
      Swal.fire('Referencia requerida', 'Esta forma de pago requiere número de referencia.', 'warning'); return; }

    const id = this.pedidoCreadoId;
    const body = {
      formaPagoId: fp.id,
      monto: +this.anticipo.monto.toFixed(2),
      referencia: this.anticipo.referencia?.trim() || undefined,
      notas: this.anticipo.notas?.trim() || undefined
    };

    this.svc.agregarPago(id, body).subscribe({
      next: () => this.afterPaymentOk(),
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo registrar el anticipo')
    });
  }

  private afterPaymentOk() {
    this.showPago.set(false);
    this.pedidoCreadoId = null;
    Swal.fire('Listo', 'Anticipo registrado.', 'success');
    this.reload();
  }

  openDetail(id: number) {
    if (this.loadingDetail) return;
    this.loadingDetail = true;
    this.detalle = null;
    this.showDetail.set(true);

    this.svc.getById(id).subscribe({
      next: d => {
        this.detalle = d;
        this.loadingDetail = false;
        const ids = (d.detalles || []).map(it => it.presentacionId);
        this.loadPresInfo(ids);
      },
      error: (e: any) => { this.loadingDetail = false; this.showDetail.set(false); this.swalErrorFrom(e, 'No se pudo obtener el detalle'); }
    });
  }
  closeDetail() { this.showDetail.set(false); this.detalle = null; }

  openEditarPedido(id: number) {
    this.svc.getById(id).subscribe({
      next: (d) => {
        this.editingId = id;

        if (Number(d.tipo) === TipoPedidoCliente.Personalizado) {
          this.resetPers();
          this.formPers.clienteId = (d as any).clienteId ?? null;
          this.formPers.clienteNombre = d.clienteNombre || '';
          this.formPers.telefono = this.sanitizePhone(d.telefono || '');
          this.formPers.direccion = d.direccionEntrega || '';
          this.formPers.fechaEntrega = d.fechaEntregaCompromisoUtc ? new Date(d.fechaEntregaCompromisoUtc).toISOString().slice(0,10) : '';
          this.formPers.estado = Number(d.estado);
          this.formPers.detalles = (d.detalles || []).map(it => ({
            presentacionId: it.presentacionId,
            presentacionNombre: it.presentacionNombre || `#${it.presentacionId}`,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            descuentoUnitario: it.descuentoUnitario,
            totalLinea: it.totalLinea,
            imgUrl: null,
            productoNombre: null
          }));

          if (d.diseno) {
            this.formPers.diseno.lienzos = d.diseno.lienzos ?? 0;
            this.formPers.diseno.color   = d.diseno.color ?? '';
            this.formPers.diseno.brich   = !!d.diseno.brich;
            this.formPers.diseno.otros   = d.diseno.otros ?? '';
            this.formPers.reportado      = d.diseno.reportado ?? null;
            this.formPers.observacionesExtra = d.diseno.extra ?? '';
          } else {
            const lines = this.obsLines(d.observaciones);
            if (lines.length) this.formPers.observacionesExtra = lines.join(' · ');
          }

          this.recalcPersTotals();
          this.clienteTerm.set(this.formPers.clienteNombre);

          const ids = this.formPers.detalles.map(it => it.presentacionId);
          this.loadPresInfo(ids);

          this.showPers.set(true);
          return;
        }

        this.resetFull();
        this.form.clienteId = (d as any).clienteId ?? null;
        this.form.clienteNombre = d.clienteNombre || '';
        this.form.telefono = this.sanitizePhone(d.telefono || '');
        this.form.direccion = d.direccionEntrega || '';
        this.form.fechaEntrega = d.fechaEntregaCompromisoUtc ? new Date(d.fechaEntregaCompromisoUtc).toISOString().slice(0,10) : '';
        this.form.estado = Number(d.estado);
        this.form.totalManual = d.total ?? 0;

        if (d.diseno) {
          this.form.diseno.lienzos = d.diseno.lienzos ?? 0;
          this.form.diseno.color   = d.diseno.color ?? '';
          this.form.diseno.brich   = !!d.diseno.brich;
          this.form.diseno.otros   = d.diseno.otros ?? '';
          this.form.reportado      = d.diseno.reportado ?? null;
          this.form.observacionesExtra = d.diseno.extra ?? '';
        } else {
          const lines = this.obsLines(d.observaciones);
          if (lines.length) this.form.observacionesExtra = lines.join(' · ');
        }

        this.clienteTerm.set(this.form.clienteNombre);
        this.showFull.set(true);
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo cargar el pedido para edición')
    });
  }

  openDevolucionDesdeLista(id: number) {
    this.svc.getById(id).subscribe({
      next: d => {
        const disponible = Math.max(0, (d.totalCobrado ?? 0) - (d.totalDevuelto ?? 0));
        if (disponible <= 0.00001) {
          Swal.fire('Sin saldo a devolver', 'Este pedido no tiene cobros disponibles para devolver.', 'info');
          return;
        }
        this.devolPedidoId = id;
        this.devolSaldoDisponible.set(+disponible.toFixed(2));
        this.devol.formaPagoId = null;
        this.devol.monto = disponible;
        this.devol.referencia = '';
        this.devol.notas = '';
        this.showDevolucion.set(true);
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo abrir la devolución')
    });
  }
  get devolRequiereRef(): boolean {
    const id = this.devol.formaPagoId;
    if (id == null) return false;
    const fp = this.formasPago().find(f => f.id === id);
    return !!fp?.requiereReferencia;
  }

  private revisarYRevertirABorradorSiNetoCero(id: number, intento = 0) {
    this.svc.getById(id).subscribe({
      next: d2 => {
        const cobrado  = +(d2.totalCobrado ?? d2.montoPagado ?? 0);
        const devuelto = +(d2.totalDevuelto ?? 0);
        const neto     = +(cobrado - devuelto).toFixed(2);
        const est      = Number(d2.estado);

        const debePasar =
          neto <= 0.00001 &&
          est !== EstadoPedidoCliente.Borrador &&
          est !== EstadoPedidoCliente.Cancelado;

        if (!debePasar) {
          this.showDevolucion.set(false);
          this.devolPedidoId = null;
          Swal.fire('Listo', 'Devolución registrada.', 'success');
          this.reload();
          return;
        }

        this.svc.cambiarEstado(id, EstadoPedidoCliente.Borrador, 'Pagos revertidos por devolución').subscribe({
          next: () => {
            this.showDevolucion.set(false);
            this.devolPedidoId = null;
            Swal.fire('Listo', 'Devolución registrado y el pedido volvió a Borrador.', 'success');
            this.reload();
          },
          error: () => {
            if (intento < 2) {
              setTimeout(() => this.revisarYRevertirABorradorSiNetoCero(id, intento + 1), 250);
            } else {
              this.showDevolucion.set(false);
              this.devolPedidoId = null;
              Swal.fire('Listo', 'Devolución registrada. (No se pudo cambiar a Borrador automáticamente)', 'info');
              this.reload();
            }
          }
        });
      },
      error: () => {
        if (intento < 2) {
          setTimeout(() => this.revisarYRevertirABorradorSiNetoCero(id, intento + 1), 250);
        } else {
          this.showDevolucion.set(false);
          this.devolPedidoId = null;
          Swal.fire('Listo', 'Devolución registrada.', 'success');
          this.reload();
        }
      }
    });
  }

  registrarDevolucion() {
    if (!this.devolPedidoId) return;

    const fp = this.formasPago().find(f => f.id === this.devol.formaPagoId);
    if (!fp) { Swal.fire('Falta forma de pago', 'Selecciona una forma de pago.', 'warning'); return; }
    if (!this.devol.monto || this.devol.monto <= 0) { Swal.fire('Monto inválido', 'Ingresa un monto válido.', 'warning'); return; }

    const max = this.devolSaldoDisponible();
    if (this.devol.monto > max + 1e-9) { Swal.fire('Excede saldo', `No puedes devolver más de ${max.toFixed(2)}.`, 'warning'); return; }
    if (fp.requiereReferencia && !(this.devol.referencia || '').trim()) {
      Swal.fire('Referencia requerida', 'Esta forma de pago requiere número de referencia.', 'warning');
      return;
    }

    const id = this.devolPedidoId;

    this.svc.agregarDevolucion(id, {
      formaPagoId: fp.id,
      monto: +this.devol.monto.toFixed(2),
      referencia: (this.devol.referencia || '').trim() || undefined,
      notas: (this.devol.notas || '').trim() || undefined
    }).subscribe({
      next: () => {
        setTimeout(() => this.revisarYRevertirABorradorSiNetoCero(id), 150);
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo registrar la devolución')
    });
  }

  closeDevolucion() { this.showDevolucion.set(false); this.devolPedidoId = null; }

  eliminarPedido(row: PedidoClienteListDto) {
    const estado = Number(row.estado);
    if (estado !== EstadoPedidoCliente.Borrador) return;

    Swal.fire({
      icon: 'warning',
      title: 'Eliminar pedido',
      text: 'Esta acción no se puede deshacer. ¿Eliminar el pedido en borrador?',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (!res.isConfirmed) return;
      this.svc.eliminar(row.id).subscribe({
        next: () => { Swal.fire('Eliminado', 'El pedido fue eliminado.', 'success'); this.reload(); },
        error: (e: any) => this.swalErrorFrom(e, 'No se pudo eliminar el pedido')
      });
    });
  }

  cancelarPedido(row: PedidoClienteListDto) {
    const estado = Number(row.estado);
    if (estado !== EstadoPedidoCliente.Confirmado) return;

    Swal.fire({
      icon: 'warning',
      title: 'Cancelar pedido',
      html: 'El pedido quedará <b>Cancelado</b> (no se elimina).<br>Si vas a devolver el anticipo, recuerda registrar un <b>egreso</b> en caja.',
      input: 'text',
      inputPlaceholder: 'Motivo (opcional)',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver'
    }).then(res => {
      if (!res.isConfirmed) return;

      this.svc.cambiarEstado(row.id, EstadoPedidoCliente.Cancelado, (res.value || '').trim()).subscribe({
        next: () => { Swal.fire('Cancelado', 'El pedido fue cancelado. Si corresponde, registra el egreso en caja.', 'success'); this.reload(); },
        error: (e: any) => this.swalErrorFrom(e, 'No se pudo cancelar el pedido')
      });
    });
  }

  reactivarPedido(row: PedidoClienteListDto) {
    const estado = Number(row.estado);
    if (estado !== EstadoPedidoCliente.Cancelado) return;

    Swal.fire({
      icon: 'question',
      title: 'Reactivar pedido',
      html: 'El pedido saldrá de <b>Cancelado</b>.<br>Si no tiene pagos, volverá a <b>Borrador</b>.<br>Si ya tiene pagos, volverá a <b>Confirmado</b>.',
      input: 'text',
      inputPlaceholder: 'Motivo (opcional)',
      showCancelButton: true,
      confirmButtonText: 'Reactivar',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (!res.isConfirmed) return;

      this.svc.cambiarEstado(row.id, EstadoPedidoCliente.Borrador, (res.value || '').trim())
        .subscribe({
          next: () => { Swal.fire('Reactivado', 'El pedido fue reactivado correctamente.', 'success'); this.reload(); },
          error: (e: any) => this.swalErrorFrom(e, 'No se pudo reactivar el pedido')
        });
    });
  }

  pasarAPreparacion(row: PedidoClienteListDto) {
    if (Number(row.estado) !== EstadoPedidoCliente.Confirmado) return;
    if (this.isFinalizado(row)) { Swal.fire('No disponible', 'El pedido ya está finalizado.', 'info'); return; }

    this.svc.cambiarEstado(row.id, EstadoPedidoCliente.EnPreparacion).subscribe({
      next: () => { Swal.fire('Listo', 'El pedido pasó a En preparación.', 'success'); this.reload(); },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo cambiar a En preparación')
    });
  }

  marcarListo(row: PedidoClienteListDto) {
    if (Number(row.estado) !== EstadoPedidoCliente.EnPreparacion) return;
    if (this.isFinalizado(row)) { Swal.fire('No disponible', 'El pedido ya está finalizado.', 'info'); return; }

    this.svc.cambiarEstado(row.id, EstadoPedidoCliente.Listo).subscribe({
      next: () => { Swal.fire('Listo', 'El pedido fue marcado como Listo.', 'success'); this.reload(); },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo marcar como Listo')
    });
  }

  entregarPedido(row: PedidoClienteListDto) {
    if (Number(row.estado) !== EstadoPedidoCliente.Listo) return;
    if (this.isFinalizado(row)) { Swal.fire('No disponible', 'El pedido ya está finalizado.', 'info'); return; }

    this.svc.getById(row.id).subscribe({
      next: d => {
        const saldo = +(d.saldo ?? ((d.total ?? 0) - (d.totalCobrado ?? 0)));
        if (saldo > 0.00001) {
          Swal.fire('Saldo pendiente', 'Para entregar, la cuenta debe estar al día.', 'warning');
          return;
        }

        this.svc.cambiarEstado(row.id, EstadoPedidoCliente.Entregado).subscribe({
          next: () => {
            const esPers = Number(row.tipo) === TipoPedidoCliente.Personalizado;
            const tieneItems = (d.detalles?.length || 0) > 0;

            if (esPers && tieneItems) {
              this.svc.convertirAVenta(row.id).subscribe({
                next: () => { Swal.fire('Entregado', 'Pedido entregado y venta creada.', 'success'); this.reload(); },
                error: () => { Swal.fire('Entregado', 'Pedido entregado. (No se pudo crear la venta automáticamente)', 'info'); this.reload(); }
              });
            } else {
              Swal.fire('Entregado', 'Pedido entregado.', 'success');
              this.reload();
            }
          },
          error: (e: any) => this.swalErrorFrom(e, 'No se pudo marcar como Entregado')
        });
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo verificar el saldo del pedido')
    });
  }

  convertirAVenta(row: PedidoClienteListDto) {
    const est = Number(row.estado);
    if (est !== EstadoPedidoCliente.Listo && est !== EstadoPedidoCliente.Entregado) return;

    if (row.tipo !== TipoPedidoCliente.Personalizado) {
      Swal.fire('No se puede convertir', 'Solo los pedidos con ítems (Personalizado) pueden convertirse a venta.', 'info');
      return;
    }
    if (this.isFinalizado(row)) {
      Swal.fire('No disponible', 'El pedido ya está finalizado.', 'info');
      return;
    }

    this.svc.getById(row.id).subscribe({
      next: d => {
        if (!d.detalles || d.detalles.length === 0) {
          Swal.fire('Sin ítems', 'No puedes convertir a venta un pedido sin ítems.', 'info');
          return;
        }
        this.svc.convertirAVenta(row.id).subscribe({
          next: () => { Swal.fire('Venta creada', 'Se convirtió el pedido a venta.', 'success'); this.reload(); },
          error: (e: any) => this.swalErrorFrom(e, 'No se pudo convertir a venta')
        });
      },
      error: (e: any) => this.swalErrorFrom(e, 'No se pudo verificar el pedido')
    });
  }

  private fmtQ(n: any): string {
    const num = Number(n ?? 0);
    try {
      return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2
      }).format(num);
    } catch {
      return `Q ${num.toFixed(2)}`;
    }
  }

  private buildErrorView(e: any): { text?: string; html?: string } {
    if (e?.status === 0) return { text: 'No hay conexión con el servidor.' };

    const err = e?.error;

    if (e?.status === 409 && err && typeof err === 'object'
        && 'error' in err && 'disponible' in err && 'solicitado' in err) {
      const disp = this.fmtQ(err.disponible);
      const sol  = this.fmtQ(err.solicitado);
      return {
        html: `
          <div style="text-align:left">
            <p><strong>${(err.error || 'Fondos insuficientes en caja')}</strong></p>
            <ul style="margin:0;padding-left:18px">
              <li><b>Disponible:</b> ${disp}</li>
              <li><b>Intentaste pagar/devolver:</b> ${sol}</li>
            </ul>
            <p style="margin-top:10px;color:#666" class="small">
              Ajusta el monto o cambia la forma de pago.
            </p>
          </div>`
      };
    }

    if (typeof err === 'string') return { text: err };
    if (err?.detail || err?.title || err?.message) {
      return { text: (err.detail || err.title || err.message) };
    }

    if (err?.errors && typeof err.errors === 'object') {
      const items: string[] = [];
      Object.values(err.errors).forEach((v: any) => {
        if (Array.isArray(v)) v.forEach(x => items.push(String(x)));
        else if (v != null) items.push(String(v));
      });
      if (items.length) {
        return {
          html: `<ul style="text-align:left; padding-left:18px; margin:0">
                   ${items.map(m => `<li>${m}</li>`).join('')}
                 </ul>`
        };
      }
    }

    return { text: `Error ${e?.status || ''} ${e?.statusText || ''}`.trim() || 'Error desconocido.' };
  }

  private extractError(e: any): string {
    try {
      if (e?.status === 0) return 'No hay conexión con el servidor.';
      const err = e?.error;

      if (err?.errors && typeof err.errors === 'object') {
        const lines: string[] = [];
        for (const k of Object.keys(err.errors)) {
          const msgs = err.errors[k];
          if (Array.isArray(msgs)) msgs.forEach(m => lines.push(`${k}: ${m}`));
        }
        if (lines.length) return lines.join(' | ');
      }

      if (typeof err === 'string') return err;
      const msg = err?.detail || err?.title || err?.message;
      if (msg) return msg;

      return `Error ${e?.status || ''} ${e?.statusText || ''}`.trim();
    } catch { return 'Error desconocido.'; }
  }

  private swalErrorFrom(e: any, titulo = 'Error'): void {
    const view = this.buildErrorView(e);
    Swal.fire({
      icon: 'error',
      title: titulo,
      ...(view.html ? { html: view.html } : { text: view.text ?? this.extractError(e) }),
      confirmButtonText: 'Entendido'
    });
  }

  get formaRequiereReferencia(): boolean {
    const id = this.anticipo.formaPagoId;
    if (id == null) return false;
    const fp = this.formasPago().find(f => f.id === id);
    return !!fp?.requiereReferencia;
  }

  resetFull() {
    this.form = {
      clienteId: null,
      clienteNombre: '',
      telefono: '',
      direccion: '',
      fechaEntrega: '',
      estado: EstadoPedidoCliente.Borrador,
      totalManual: 0,
      diseno: { lienzos: 0, color: '', brich: false, otros: '' },
      reportado: null,
      observacionesExtra: '',
    };
    this.clienteTerm.set('');
    this.clientesSug.set([]);
  }

  resetPers() {
    this.formPers = {
      clienteId: null,
      clienteNombre: '',
      telefono: '',
      direccion: '',
      fechaEntrega: '',
      estado: EstadoPedidoCliente.Borrador,
      observaciones: '',
      diseno: { lienzos: 0, color: '', brich: false, otros: '' },
      reportado: null,
      observacionesExtra: '',
      detalles: [],
      subtotal: 0,
      descuento: 0,
      total: 0,
    };
    this.clienteTerm.set('');
    this.clientesSug.set([]);
  }

  resumenDescripcion(desc?: string | null, max = 3): string {
    if (!desc) return '—';
    const tokensAll = desc.split(/[|·]/g).map(s => s.trim()).filter(Boolean);
    if (tokensAll.length === 0) return '—';

    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const prio = ['lienzos:', 'color:', 'brich:'];

    const remaining = [...tokensAll];
    const picked: string[] = [];

    for (const key of prio) {
      const i = remaining.findIndex(p => norm(p).startsWith(key));
      if (i > -1) { picked.push(remaining[i]); remaining.splice(i, 1); if (picked.length >= max) break; }
    }

    const seen = new Set(picked.map(p => norm(p)));
    for (const p of remaining) {
      const k = norm(p);
      if (!seen.has(k)) { picked.push(p); seen.add(k); if (picked.length >= max) break; }
    }

    const out = picked.join(' · ');
    return tokensAll.length > picked.length ? out + ' …' : out;
  }

  observacionesListaUnicas(obs?: string | null): string[] {
    if (!obs) return [];
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const raw = obs.split(/[|·]/g).map(s => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of raw) { const k = norm(t); if (!seen.has(k)) { seen.add(k); out.push(t); } }
    return out;
  }

  private recalcPersTotals() {
    let subtotal = 0, descuento = 0, total = 0;
    for (const l of this.formPers.detalles) {
      const pu = Number(l.precioUnitario) || 0;
      const du = Number(l.descuentoUnitario) || 0;
      const cant = Number(l.cantidad) || 0;
      const tl = +(cant * (pu - du)).toFixed(2);
      l.totalLinea = Math.max(0, tl);
      subtotal += +(cant * pu).toFixed(2);
      descuento += +(cant * du).toFixed(2);
      total += l.totalLinea;
    }
    this.formPers.subtotal = +subtotal.toFixed(2);
    this.formPers.descuento = +descuento.toFixed(2);
    this.formPers.total = +total.toFixed(2);
  }
  removeLine(i: number) { this.formPers.detalles.splice(i, 1); this.recalcPersTotals(); }

  openCatalog() {
    this.catTerm.set('');
    this.catRows.set([]);
    this.catSelected.set(null);
    this.catPopover.set(false);
    this.showCat.set(true);

    this.catSvc.list(true).subscribe({
      next: list => this.categorias.set(list || []),
      error: () => this.categorias.set([]),
    });

    this.buscarCatalogo();
  }

  closeCatalog() { this.showCat.set(false); }

  buscarCatalogo() {
    this.catLoading = true;
    const term = this.catTerm().trim();
    const categoriaId = this.catSelected();

    this.svc.catalogo({
      term,
      soloActivos: true,
      take: this.catTake,
      excluirPedidoId: this.editingId ?? undefined,
      categoriaId: categoriaId ?? undefined,
    }).subscribe({
      next: rows => { this.catRows.set(rows || []); this.catLoading = false; },
      error: () => { this.catLoading = false; }
    });
  }

  selectCategoria(id: number | null) {
    this.catSelected.set(id);
    this.catPopover.set(false);
    this.buscarCatalogo();
  }

  catNombreSel(): string {
    const name = this.catSelectedName();
    return name || 'Todas';
  }

  imgFor(r: CatalogItemDto): string {
    return r.fotoUrl ? r.fotoUrl : '/assets/no-image.png';
  }

  private loadPresInfo(ids: number[]) {
    const missing = ids.filter(id => !this.presCache.has(id));
    if (!missing.length) return;

    this.invSvc.listarProductos().subscribe({
      next: rows => {
        (rows || []).forEach(r => {
          if (!this.presCache.has(r.presentacionId)) {
            this.presCache.set(r.presentacionId, {
              imgUrl: r.fotoUrl || null,
              productoNombre: r.producto || null,
            });
          }
        });

        this.formPers.detalles.forEach(l => {
          const m = this.presCache.get(l.presentacionId);
          if (m) { l.imgUrl = m.imgUrl; l.productoNombre = m.productoNombre; }
        });
      },
      error: () => {}
    });
  }

  lineImg = (presentacionId: number) =>
    this.presCache.get(presentacionId)?.imgUrl || '/assets/no-image.png';

  lineProducto = (presentacionId: number, fallback?: string | null) =>
    this.presCache.get(presentacionId)?.productoNombre || (fallback || '');

  private warnNoStock(nombre: string) {
    Swal.fire('Sin stock', `“${nombre}” no tiene unidades disponibles en inventario.`, 'info');
  }
  private warnInsuficiente(nombre: string, disp: number) {
    Swal.fire('Stock insuficiente', `Para “${nombre}” solo hay ${disp.toFixed(2)} disponibles.`, 'warning');
  }

  private displayItemName(it: CatalogItemDto): string {
    const prod = (it.producto || '').trim();
    const pres = (it.nombre || '').trim();
    const genericas = new Set(['unidad', 'unidades', 'u', 'pieza', 'pza', 'pz', 'default', '-']);
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const presIsGeneric = !pres || genericas.has(norm(pres)) || norm(prod) === norm(pres);
    if (presIsGeneric) return prod || `#${it.id}`;
    return prod ? `${prod} — ${pres}` : (pres || `#${it.id}`);
  }

  pickFromCatalog(it: CatalogItemDto) {
    const nombrePretty = this.displayItemName(it);
    const disp = Number(it.disponible ?? NaN);

    if (!Number.isNaN(disp) && disp <= 0) {
      this.warnNoStock(nombrePretty);
      return;
    }

    const idx = this.formPers.detalles.findIndex(l => l.presentacionId === it.id);
    const precio = +(it.precioVentaDefault != null ? it.precioVentaDefault : 0);

    if (idx === -1) {
      if (!Number.isNaN(disp) && 1 > disp) {
        this.warnInsuficiente(nombrePretty, disp);
        return;
      }

      this.formPers.detalles.unshift({
        presentacionId: it.id,
        presentacionNombre: it.nombre || `#${it.id}`,
        cantidad: 1,
        precioUnitario: +precio.toFixed(2),
        descuentoUnitario: 0,
        totalLinea: +(+precio).toFixed(2),
        stock: it.stock ?? null,
        disponible: !Number.isNaN(disp) ? disp : null,
        imgUrl: it.fotoUrl ?? null,
        productoNombre: it.producto ?? null
      });
    } else {
      const cur = Number(this.formPers.detalles[idx].cantidad) || 0;
      const nueva = +(cur + 1).toFixed(2);

      if (!Number.isNaN(disp) && nueva > disp) {
        this.warnInsuficiente(nombrePretty, disp);
        return;
      }
      this.formPers.detalles[idx].cantidad = nueva;
    }

    this.recalcPersTotals();

    const ids = this.formPers.detalles.map(l => l.presentacionId);
    this.loadPresInfo(ids);

    this.closeCatalog();
  }

  onLineChange() {
    for (const l of this.formPers.detalles) {
      const disp = l.disponible;
      if (disp != null && l.cantidad > disp) {
        l.cantidad = +disp;
        const n = l.productoNombre || l.presentacionNombre || ('#' + l.presentacionId);
        this.warnInsuficiente(n, disp);
      }
    }
    this.recalcPersTotals();
  }

  showBtnDevolucion(p: PedidoClienteListDto): boolean {
    const est = Number(p.estado);
    if (est === EstadoPedidoCliente.Borrador) return false;
    if (this.isFinalizado(p)) return false;
    return est === EstadoPedidoCliente.Confirmado
        || est === EstadoPedidoCliente.EnPreparacion
        || est === EstadoPedidoCliente.Listo;
  }

  hasCobros(p: PedidoClienteListDto): boolean {
    const a: any = p as any;
    const paid = Number(a.montoPagado ?? a.totalCobrado ?? a.pagado ?? 0);
    const cnt  = Number(a.pagos ?? a.pagosCount ?? a.cobrosCount ?? 0);

    const hasField = ['montoPagado','totalCobrado','pagado','pagos','pagosCount','cobrosCount']
      .some(k => k in a);
    if (!hasField) return false;

    return paid > 0 || cnt > 0;
  }

  asDmy(v?: string | Date | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return new Intl.DateTimeFormat('es-GT', { day:'2-digit', month:'2-digit', year:'numeric' }).format(d);
  }
  asDmyTime(v?: string | Date | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return new Intl.DateTimeFormat('es-GT', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12: false
    }).format(d);
  }
  asDmyUtc(v?: string | Date | null): string {
    if (!v) return '—';
    const d = new Date(v);
    const fixed = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return new Intl.DateTimeFormat('es-GT', { day:'2-digit', month:'2-digit', year:'numeric' }).format(fixed);
  }
}
