import { Component, OnInit, inject, signal, computed, HostListener, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';

import { ProveedoresService } from '../../../services/proveedores.service';
import {
  PedidosService,
  PedidoProveedorCreate,
  PedidoProveedorListItem,
  PedidoProveedorDto,
} from '../../../services/pedidos.service';
import { FormasPagoService, FormaPagoItem } from '../../../services/formas-pago.service';
import { CategoriasService } from '../../../services/categorias.service';
import { MarcasService } from '../../../services/marcas.service';
import { UnidadesMedidaService } from '../../../services/unidades-medida.service';
import { ProductosService } from '../../../services/productos.service';
import { ProveedorCatalogoService, CatalogoItem } from '../../../services/proveedor-catalogo.service';

type Opt = { id: number; nombre: string };

type LineaTemp = {
  presentacionId: number;
  producto: string;
  presentacion: string;
  cantidad: number;
  precioUnitario: number;
  totalLinea: number;
  notas?: string | null;
};

@Component({
  selector: 'app-pedidos-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrls: ['./proveedores.css'],
})
export class PedidosProveedores implements OnInit {
  private provSvc = inject(ProveedoresService);
  private svc = inject(PedidosService);
  private fpSvc = inject(FormasPagoService);
  private catSvc = inject(CategoriasService);
  private marcaSvc = inject(MarcasService);
  private umSvc = inject(UnidadesMedidaService);
  private http = inject(HttpClient);
  private prodSvc = inject(ProductosService);
  private provCatSvc = inject(ProveedorCatalogoService);

  // ====== Listado ======
  loading = signal(false);
  pedidos = signal<PedidoProveedorListItem[]>([]);
  q = signal<string>('');

  // ====== Vista (activos / cerrados / cancelados) + paginación ======
  view = signal<'activos' | 'cerrados' | 'cancelados'>('activos');
  page = signal<number>(0);
  pageSize = signal<number>(8);

  /** Búsqueda (todas las filas) */
  filteredAll = computed(() => {
    const term = this.q().trim().toLowerCase();
    const rows = this.pedidos();
    if (!term) return rows;
    return rows.filter(p =>
      (p.numero || '').toLowerCase().includes(term) ||
      (p.proveedorNombre || '').toLowerCase().includes(term)
    );
  });

  /** Separación por estado */
  activos = computed(() =>
    this.filteredAll().filter(p => {
      const k = this.estadoKeyFromValue((p as any).estado);
      return k !== 'cerrado' && k !== 'cancelado';
    })
  );
  cerrados = computed(() =>
    this.filteredAll().filter(p => this.estadoKeyFromValue((p as any).estado) === 'cerrado')
  );
  cancelados = computed(() =>
    this.filteredAll().filter(p => this.estadoKeyFromValue((p as any).estado) === 'cancelado')
  );

  /** Lista según vista actual */
  listForView = computed(() =>
    this.view() === 'activos'   ? this.activos()   :
    this.view() === 'cerrados'  ? this.cerrados()  :
                                  this.cancelados()
  );

  totalItems = computed(() => this.listForView().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

  paged = computed(() => {
    const list = this.listForView();
    const size = this.pageSize();
    const lastIndex = Math.max(0, this.totalPages() - 1);
    const page = Math.min(this.page(), lastIndex);
    const start = page * size;
    return list.slice(start, start + size);
  });

  canPrev = computed(() => this.page() > 0);
  canNext = computed(() => this.page() < this.totalPages() - 1);
  prev(): void {
    if (this.page() > 0) {
      this.page.set(this.page() - 1);
    }
  }

  next(): void {
    const last = this.totalPages() - 1;
    if (this.page() < last) {
      this.page.set(this.page() + 1);
    }
  }

  goActivos()     { if (this.view() !== 'activos')    { this.view.set('activos');    this.page.set(0); } }
  goCerrados()    { if (this.view() !== 'cerrados')   { this.view.set('cerrados');   this.page.set(0); } }
  goCancelados()  { if (this.view() !== 'cancelados') { this.view.set('cancelados'); this.page.set(0); } }

  @ViewChild('listSearch', { static: false }) listSearch?: ElementRef<HTMLInputElement>;
  @ViewChild('catSearch', { static: false }) catSearch?: ElementRef<HTMLInputElement>;

  // ====== Catálogo y combos ======
  proveedores: Opt[] = [];
  proveedorId: number | null = null;
  term = '';
  cargandoCatalogo = false;
  catalogo: CatalogoItem[] = [];
  private catDebounce?: any;

  // Placeholder inline
  placeholderImg =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect width="100%" height="100%" fill="%23f5f5f5"/><text x="50%" y="55%" font-size="12" text-anchor="middle" fill="%23999">IMG</text></svg>';

  // ====== Crear pedido (modal) ======
  showCreate = false;
  observaciones: string | null = null;
  lineas: LineaTemp[] = [];
  guardando = false;

  // ====== Recepción (modal) ======
  showRx = false;
  pedidoRx: PedidoProveedorDto | null = null;
  rxFecha = new Date().toISOString().slice(0, 10);
  rxNumero: string | null = null;
  rxFormaPagoId: number | null = null;
  rxReferencia: string | null = null;
  formasPago: FormaPagoItem[] = [];
  rxRows: Array<{
    detalleId: number;
    producto: string;
    presentacion: string;
    pedida: number;
    recibida: number;
    pendiente: number;
    recibirAhora: number;
    costoUnitario: number;
    notas?: string | null;
  }> = [];

  // ====== Modal: Ver detalle ======
  showView = false;
  pedidoView: PedidoProveedorDto | null = null;

  // ====== Quick product (sub-modal) ======
  showQuick = false;
  quickSaving = false;
  categorias: Opt[] = [];
  marcas: Opt[] = [];
  unidades: Array<{ id: number; simbolo: string }> = [];

  qp = {
    nombre: '',
    categoriaId: null as number | null,
    proveedorId: null as number | null,
    activo: true,
    precioCompraDefault: 0,
    precioVentaDefault: 0,
    fotoUrl: null as string | null,
  };

  // ====== Helpers de imagen ======
  onImgError(evt: Event): void {
    const img = evt.target as HTMLImageElement | null;
    if (img) {
      (img as any).onerror = null;
      img.src = this.placeholderImg;
    }
  }

  // ====== Stepper entero (±) en el catálogo ======
  enforceInt(el: HTMLInputElement): void {
    const raw = (el.value ?? '').toString();
    const onlyDigits = raw.replace(/[^\d]/g, '');
    const n = onlyDigits === '' ? 0 : parseInt(onlyDigits, 10);
    el.value = String(isFinite(n) ? Math.max(0, n) : 0);
  }
  stepUp(el: HTMLInputElement): void {
    this.enforceInt(el);
    el.value = String(Math.max(0, parseInt(el.value || '0', 10) + 1));
  }
  stepDown(el: HTMLInputElement): void {
    this.enforceInt(el);
    el.value = String(Math.max(0, parseInt(el.value || '0', 10) - 1));
  }

  // ====== Atajos de teclado ======
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    const key = (e.key || '').toLowerCase();

    // Ctrl+K => buscar en listado
    if (e.ctrlKey && key === 'k') {
      e.preventDefault();
      this.listSearch?.nativeElement.focus();
      this.listSearch?.nativeElement.select();
      return;
    }

    // Ctrl+Shift+N => nueva cotización
    if (e.ctrlKey && e.shiftKey && key === 'n') {
      e.preventDefault();
      if (!this.showCreate && !this.showRx && !this.showQuick) this.openCreate();
      return;
    }

    // Esc => cierra el modal activo
    if (key === 'escape') {
      if (this.showQuick) { this.closeQuickAdd(); return; }
      if (this.showRx) { this.closeRx(); return; }
      if (this.showCreate) { this.closeCreate(); return; }
      if (this.showView) { this.closeView(); return; }
    }
  }

  // ====== Ciclo ======
  ngOnInit(): void {
    this.reload();
    this.loadProveedores();

    // Resetear página cuando cambian vista, búsqueda o lista
    effect(() => { const _ = [this.view(), this.q(), this.pedidos()]; this.page.set(0); });

    console.log('[PedidosProveedores] init OK (pp-page v4 con Activos/Cerrados/Cancelados + paginación)');
  }

  private loadProveedores(): void {
    this.provSvc.list(true).subscribe({
      next: rows => {
        this.proveedores = (rows || []).map(r => ({ id: r.id, nombre: r.nombre }));
        if (this.proveedores.length > 0 && !this.proveedorId) {
          this.proveedorId = this.proveedores[0].id;
        }
      },
      error: (e) => {
        // Solo avisar si NO hay conexión
        if (e?.status === 0) this.swalNoConn();
      }
    });

    this.catSvc.list(true).subscribe({
      next: l => this.categorias = (l || []).map(x => ({id:x.id, nombre:x.nombre})),
      error: () => { /* silencioso */ }
    });
  }

  reload(): void {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: list => { this.pedidos.set(list || []); this.loading.set(false); this.page.set(0); },
      error: (e) => {
        this.loading.set(false);
        // Solo avisar si NO hay conexión
        if (e?.status === 0) this.swalNoConn();
      }
    });
  }

  asDate(fecha: string | null | undefined): Date | null {
    if (!fecha) return null;
    const s = String(fecha);
    const iso = s.includes('T') ? s : `${s}T00:00:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // ===================== Crear =====================
  openCreate(): void {
    this.showCreate = true;
    this.proveedorId = this.proveedores.length > 0 ? this.proveedores[0].id : null;
    this.observaciones = null;
    this.lineas = [];
    this.catalogo = [];
    this.term = '';
    if (this.proveedorId) this.cargarCatalogo();

    setTimeout(() => this.catSearch?.nativeElement?.focus(), 80);
  }

  closeCreate(): void {
    this.showCreate = false;
    this.lineas = [];
    this.catalogo = [];
    this.term = '';
    this.observaciones = null;
  }

  cargarCatalogo(): void {
    if (!this.proveedorId) { this.catalogo = []; return; }
    this.cargandoCatalogo = true;
    this.provCatSvc.list(this.proveedorId, { term: this.term, soloActivos: true }).subscribe({
      next: rows => { this.catalogo = rows || []; this.cargandoCatalogo = false; },
      error: e => {
        this.cargandoCatalogo = false;
        // Solo avisar si NO hay conexión
        if (e?.status === 0) this.swalNoConn();
      }
    });
  }
  buscarCatalogo(): void {
    clearTimeout(this.catDebounce);
    this.catDebounce = setTimeout(() => this.cargarCatalogo(), 300);
  }

  addLineaFrom(it: CatalogoItem, qtyInput: HTMLInputElement): void {
    const cantidad = Number(qtyInput.value || 0);
    if (!cantidad || cantidad <= 0) {
      this.Toast.fire({ icon: 'info', title: 'Ingresa una cantidad mayor a 0' });
      return;
    }
    const precio = Number(it.precioSugerido || 0);
    const idx = this.lineas.findIndex(x => x.presentacionId === it.presentacionId);
    if (idx >= 0) {
      const l = this.lineas[idx]; l.cantidad += cantidad; l.precioUnitario = precio; this.recalcLinea(l);
      this.Toast.fire({ icon: 'success', title: 'Cantidad actualizada en línea existente' });
    } else {
      const nuevaLinea: LineaTemp = {
        presentacionId: it.presentacionId,
        producto: it.productoNombre,
        presentacion: it.presentacionNombre,
        cantidad, precioUnitario: precio,
        totalLinea: +(cantidad * precio).toFixed(2),
      };
      this.lineas.push(nuevaLinea);
      this.Toast.fire({ icon: 'success', title: 'Producto agregado al pedido' });
    }
    qtyInput.value = '0';
  }

  recalcLinea(l: LineaTemp): void {
    const qty = Number(l.cantidad || 0);
    const price = Number(l.precioUnitario || 0);
    l.totalLinea = +(qty * price).toFixed(2);
  }

  eliminarLinea(i: number): void {
    this.lineas.splice(i, 1);
    this.Toast.fire({ icon: 'info', title: 'Línea eliminada' });
  }

  get subtotal(): number {
    return +this.lineas.reduce((s, l) => s + (l.totalLinea || 0), 0).toFixed(2);
  }
  get total(): number {
    return this.subtotal;
  }

  guardar(ngf: NgForm): void {
    if (!this.proveedorId) { this.Toast.fire({ icon: 'warning', title: 'Selecciona un proveedor' }); return; }
    if (!this.lineas.length) { this.Toast.fire({ icon: 'warning', title: 'Agrega al menos una línea al pedido' }); return; }
    this.guardando = true;

    const dto: PedidoProveedorCreate = {
      proveedorId: this.proveedorId,
      observaciones: this.observaciones || undefined,
      detalles: this.lineas.map(l => ({
        presentacionId: l.presentacionId,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        notas: l.notas || undefined,
      })),
    };

    this.svc.create(dto).subscribe({
      next: ({ id }) => {
        this.guardando = false; this.closeCreate();
        this.Toast.fire({ icon: 'success', title: `Pedido #${id} creado` });
        this.reload();
      },
      error: (e) => { this.guardando = false; this.swalErrorFrom(e, 'No se pudo crear el pedido'); }
    });
  }

  // ===================== Acciones de flujo =====================
  enviar(p: PedidoProveedorListItem): void {
    Swal.fire({
      icon: 'question',
      title: '¿Enviar pedido?',
      text: `Se enviará el pedido ${p.numero || '#' + p.id}`,
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) {
        this.svc.enviar(p.id).subscribe({
          next: () => { this.Toast.fire({icon:'success', title:'Pedido enviado correctamente'}); this.reload(); },
          error: e => this.swalErrorFrom(e, 'No se pudo enviar el pedido')
        });
      }
    });
  }

  aprobar(p: PedidoProveedorListItem): void {
    Swal.fire({
      icon:'question',
      title:'¿Aprobar pedido?',
      text:`Se aprobará el pedido ${p.numero || '#' + p.id}`,
      showCancelButton:true,
      confirmButtonText:'Sí, aprobar',
      cancelButtonText:'Cancelar'
    }).then(result => {
      if (result.isConfirmed) {
        this.svc.aprobar(p.id).subscribe({
          next: () => { this.Toast.fire({icon:'success', title:'Pedido aprobado correctamente'}); this.reload(); },
          error: e => this.swalErrorFrom(e, 'No se pudo aprobar el pedido')
        });
      }
    });
  }

  cancelar(p: PedidoProveedorListItem): void {
    const esParcial = this.isEstado(p, 'ParcialmenteRecibido');

    Swal.fire({
      icon: esParcial ? 'warning' : 'question',
      title: esParcial ? 'Cancelar remanente pendiente' : '¿Cancelar pedido?',
      html: esParcial
        ? `<div style="text-align:left">
             <p><strong>Este pedido ya tiene recepciones.</strong></p>
             <p>Se <strong>cancelará el remanente pendiente</strong> (lo ya recibido no se afectará).</p>
             <p class="small" style="color:#666;margin-top:8px">
               Nota: Esta acción <strong>no revertirá</strong> compras ni inventario ya registrados.
             </p>
           </div>`
        : `Se cancelará definitivamente el pedido ${p.numero || ('#' + p.id)}.`,
      showCancelButton: true,
      confirmButtonText: esParcial ? 'Sí, cancelar remanente' : 'Sí, cancelar',
      cancelButtonText: 'No cancelar',
      confirmButtonColor: '#d33'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.svc.cancelar(p.id).subscribe({
        next: () => {
          this.Toast.fire({icon: 'success', title: esParcial ? 'Remanente cancelado' : 'Pedido cancelado'});
          this.reload();
        },
        error: e => this.swalErrorFrom(e, 'No se pudo cancelar el pedido')
      });
    });
  }

  // ===================== Recepción =====================
  openRecibir(p: PedidoProveedorListItem): void {
    this.loading.set(true);
    this.svc.getById(p.id).subscribe({
      next: full => {
        this.pedidoRx = full;
        this.rxFecha = new Date().toISOString().slice(0,10);
        this.rxNumero = null;
        this.rxFormaPagoId = null;
        this.rxReferencia = null;

        this.fpSvc.list(true).subscribe({ next: fps => {
          this.formasPago = fps || [];
          if (this.formasPago.length > 0) this.rxFormaPagoId = this.formasPago[0].id;
        }});

        this.rxRows = full.detalles.map(d => ({
          detalleId: d.id,
          producto: d.productoNombre,
          presentacion: d.presentacionNombre,
          pedida: d.cantidad,
          recibida: d.cantidadRecibida,
          pendiente: +(d.cantidad - d.cantidadRecibida).toFixed(2),
          recibirAhora: +(d.cantidad - d.cantidadRecibida).toFixed(2),
          costoUnitario: d.precioUnitario,
          notas: ''
        }));

        this.showRx = true;
        this.loading.set(false);
      },
      error: e => { this.loading.set(false); this.swalErrorFrom(e, 'No se pudo abrir la recepción'); }
    });
  }

  closeRx(): void {
    this.showRx = false;
    this.pedidoRx = null;
    this.rxRows = [];
    this.rxFormaPagoId = null;
    this.rxReferencia = null;
  }

  rxRecalcRow(r: any): void {
    r.recibirAhora = Math.max(0, Math.min(Number(r.recibirAhora || 0), r.pendiente));
  }

  get rxSubtotal(): number {
    return +this.rxRows.reduce((s, r) =>
      s + Number(r.recibirAhora || 0) * Number(r.costoUnitario || 0), 0).toFixed(2);
  }
  get rxTotal(): number { return this.rxSubtotal; }
  get rxHayAlgo(): boolean { return this.rxRows.some(r => Number(r.recibirAhora || 0) > 0); }
  get rxFormaPagoRequiereRef(): boolean {
    const fp = this.formasPago.find(f => f.id === this.rxFormaPagoId);
    return !!fp?.requiereReferencia;
  }

  confirmarRecepcion(): void {
    if (!this.pedidoRx) return;
    if (!this.rxFormaPagoId){ this.Toast.fire({icon:'warning',title:'Selecciona una forma de pago'}); return; }
    if (!this.rxHayAlgo){ this.Toast.fire({icon:'warning',title:'Ingresa cantidades a recibir'}); return; }
    if (this.rxFormaPagoRequiereRef && !this.rxReferencia?.trim()){
      this.Toast.fire({icon:'warning', title:'Ingresa la referencia del depósito/transferencia'}); return;
    }

    const dto = {
      fecha: this.rxFecha,
      numero: this.rxNumero || undefined,
      formaPagoId: this.rxFormaPagoId!,
      referencia: this.rxReferencia || undefined,
      lineas: this.rxRows
        .filter(r => Number(r.recibirAhora||0) > 0)
        .map(r => ({
          pedidoProveedorDetalleId: r.detalleId,
          cantidad: Number(r.recibirAhora),
          costoUnitario: Number(r.costoUnitario),
          notas: r.notas || undefined
        }))
    };

    this.svc.recibir(this.pedidoRx.id, dto).subscribe({
      next: () => { this.Toast.fire({icon:'success', title:'Recepción registrada exitosamente'}); this.closeRx(); this.reload(); },
      error: e => this.swalErrorFrom(e, 'No se pudo registrar la recepción')
    });
  }

  // ===================== Ver detalle (pedido cerrado) =====================
  verDetalle(p: PedidoProveedorListItem): void {
    this.svc.getById(p.id).subscribe({
      next: (full) => { this.pedidoView = full; this.showView = true; },
      error: e => this.swalErrorFrom(e, 'No se pudo cargar el detalle')
    });
  }
  closeView(): void { this.showView = false; this.pedidoView = null; }

  // ===================== Quick Add =====================
  openQuickAdd(): void {
    if (!this.proveedorId) {
      this.Toast.fire({icon:'warning', title:'Selecciona un proveedor primero'});
      return;
    }
    this.qp = {
      nombre: '',
      categoriaId: (this.categorias[0]?.id ?? null),
      proveedorId: this.proveedorId,
      activo: true,
      precioCompraDefault: 0,
      precioVentaDefault: 0,
      fotoUrl: null
    };
    this.showQuick = true;
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('section.modal.sub-modal input');
      el?.focus();
    }, 60);
  }

  closeQuickAdd(): void { this.showQuick = false; }

  onQuickFile(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) this.uploadQuickImage(file);
  }

  onQuickDrop(evt: DragEvent): void {
    evt.preventDefault();
    const file = evt.dataTransfer?.files?.[0];
    if (file) this.uploadQuickImage(file);
  }

  private uploadQuickImage(file: File): void {
    this.quickSaving = true;
    this.prodSvc.uploadImage(file).subscribe({
      next: ({ url }) => { this.qp.fotoUrl = url; this.quickSaving = false; },
      error: e => { this.quickSaving = false; this.swalErrorFrom(e, 'No se pudo subir la imagen'); }
    });
  }

  quickCreate(): void {
    if (!this.qp.nombre || !this.qp.categoriaId || !this.qp.proveedorId || !this.qp.fotoUrl) {
      this.Toast.fire({icon:'warning', title:'Completa los campos obligatorios'});
      return;
    }
    this.quickSaving = true;

    this.prodSvc.create({
      nombre: this.qp.nombre,
      categoriaId: this.qp.categoriaId!,
      proveedorId: this.qp.proveedorId!,
      fotoUrl: this.qp.fotoUrl!,
      precioCompraDefault: Number(this.qp.precioCompraDefault || 0),
      precioVentaDefault: Number(this.qp.precioVentaDefault || 0),
      activo: !!this.qp.activo
    }).subscribe({
      next: () => {
        this.quickSaving = false;
        this.Toast.fire({icon:'success', title:'Producto creado'});
        this.closeQuickAdd();
        this.cargarCatalogo();
      },
      error: e => { this.quickSaving = false; this.swalErrorFrom(e, 'No se pudo crear el producto'); }
    });
  }

  // ===== Helpers estado/UI =====
  private normEstado(s: any): string {
    return (s ?? '')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();
  }

  private estadoKeyFromValue(val: any): string {
    if (typeof val === 'number') {
      switch (val) {
        case 0: return 'borrador';
        case 1: return 'enviado';
        case 2: return 'aprobado';
        case 3: return 'parcialmenterecibido';
        case 4: return 'cerrado';
        case 5: return 'cancelado';   // ← mapeo para cancelado (proveedores)
        default: return '';
      }
    }
    const k = this.normEstado(val);
    if (!k) return '';
    const map: Record<string,string> = {
      borrador:'borrador', enviado:'enviado', aprobado:'aprobado',
      parcialmenterecibido:'parcialmenterecibido',
      cerrado:'cerrado', cancelado:'cancelado'
    };
    if (k === 'parcialmenterecibido') return 'parcialmenterecibido';
    return map[k] ?? k;
  }

  estadoClass(estado: any) {
    const k = this.estadoKeyFromValue(estado);
    return {
      pill:true,
      borrador:k==='borrador',
      enviado:k==='enviado',
      aprobado:k==='aprobado',
      parcial:k==='parcialmenterecibido',
      cerrado:k==='cerrado',
      cancelado:k==='cancelado'
    };
  }

  isEstado(p: PedidoProveedorListItem, ...estados: string[]) {
    const k = this.estadoKeyFromValue((p as any).estado);
    const keys = estados.map(e => this.estadoKeyFromValue(e));
    return keys.includes(k);
  }

  estadoLabel(estado: any) {
    const k = this.estadoKeyFromValue(estado);
    const map: Record<string,string> = {
      borrador:'borrador',
      enviado:'enviado',
      aprobado:'aprobado',
      parcialmenterecibido:'parcialmente recibido',
      cerrado:'cerrado',
      cancelado:'cancelado'
    };
    if (map[k]) return map[k];
    if (typeof estado === 'number') return String(estado);
    return (estado ?? '').toString();
  }

  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  // ====== Errores enriquecidos ======
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
              <li><b>Intentaste pagar:</b> ${sol}</li>
            </ul>
            <p style="margin-top:10px;color:#666" class="small">
              Ajusta las cantidades o cambia la forma de pago.
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

  private swalErrorFrom(e: any, titulo = 'Error'): void {
    const view = this.buildErrorView(e);
    Swal.fire({
      icon: 'error',
      title: titulo,
      ...(view.html ? { html: view.html } : { text: view.text }),
      confirmButtonText: 'Entendido'
    });
  }

  /** Solo para el caso de SIN CONEXIÓN en cargas/listas */
  private swalNoConn(): void {
    Swal.fire({ icon: 'error', title: 'Ups…', text: 'No hay conexión con el servidor.' });
  }

  trackByPedidoId = (_: number, item: PedidoProveedorListItem) => item.id;
  trackByProveedorId = (_: number, item: Opt) => item.id;
  trackByCatalogoId = (_: number, item: CatalogoItem) => item.presentacionId;
  trackByLineaId = (_: number, item: LineaTemp) => item.presentacionId;
  trackByCategoriaId = (_: number, item: Opt) => item.id;
  trackByMarcaId = (_: number, item: Opt) => item.id;
  trackByUnidadId = (_: number, item: {id: number; simbolo: string}) => item.id;
  trackByFormaPagoId = (_: number, item: FormaPagoItem) => item.id;
  trackByRxRowId = (_: number, item: any) => item.detalleId;
}
