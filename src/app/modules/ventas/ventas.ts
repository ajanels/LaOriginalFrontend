import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

import {
  VentasService,
  ProductoDto,
  VentaCreate,
  VentaDetailDto,
  ClienteItem,
  FormaPagoItem,
  StockDisponibleDto,
} from '../../services/ventas.service';
import { FormasPagoService } from '../../services/formas-pago.service';
import { ClientesService } from '../../services/clientes.service';

type ProductoDtoExt = ProductoDto & {
  reservado?: number | null;
  disponible?: number | null;
};

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ventas.html',
  styleUrls: ['./ventas.css'],
})
export class Ventas {
  // Servicios
  private ventasService = inject(VentasService);
  private fpSvc = inject(FormasPagoService);
  private cliSvc = inject(ClientesService);

  // Catálogo y filtro
  productos: ProductoDtoExt[] = [];
  filtro = '';

  // Carrito
  seleccionados: (ProductoDtoExt & { cantidadVenta: number })[] = [];

  // Cobro
  showCobro = false;
  formasPago: FormaPagoItem[] = [];
  formaPagoId: number | null = null;

  // Cliente (autocomplete)
  clienteNombre = '';
  clienteId: number | null = null;
  clienteSugerencias: ClienteItem[] = [];
  private timer?: any;

  // Campos variables por forma de pago
  referencia: string | null = null; // depósito/transferencia
  recibido: number | null = null;   // efectivo

  // Datos de empresa para el ticket
  private empresa = {
    nombre: 'La Original',
    direccion: 'chicua prmero, sector ajanel',
    email: 'laoriginal@gmail.com',
    telefono: '32-15-41-44',
    logoUrl: '/icons/oficialoriginal.png' 
  };

  // ===== Ciclo de vida =====
  ngOnInit() { this.cargarProductos(); }

  // ===== Derivados =====
  get totalVenta(): number {
    return this.seleccionados.reduce(
      (acc, s) => acc + (Number(s.cantidadVenta || 0) * Number(s.precioVenta || 0)),
      0
    );
  }

  get fpActual(): FormaPagoItem | undefined {
    const id = Number(this.formaPagoId ?? 0);
    return this.formasPago.find(f => f.id === id);
  }
  get esEfectivo(): boolean {
    const n = (this.fpActual?.nombre || '').trim().toLowerCase();
    return ['efectivo', 'cash', 'contado'].includes(n);
  }
  get fpRequiereRef(): boolean {
    return !!this.fpActual?.requiereReferencia && !this.esEfectivo;
  }

  private extractError(e: any): string {
  try {
    if (e?.status === 0) return 'No hay conexión con el servidor.';
    if (typeof e?.error === 'string') return e.error;
    const err = e?.error;
    if (err?.detail || err?.title || err?.message) return (err.detail || err.title || err.message);
    return `Error ${e?.status || ''} ${e?.statusText || ''}`.trim();
  } catch { return 'Error desconocido.'; }
}
private swalErrorFrom(e: any, titulo = 'Error'): void {
  Swal.fire({ icon: 'error', title: titulo, text: this.extractError(e), confirmButtonText: 'Entendido' });
}
private showInfo(msg: string) {
  Swal.fire({ icon: 'info', title: 'Información', text: msg });
}


  // ===== Cargar catálogo =====
  cargarProductos() {
  const term = (this.filtro || '').trim();

  this.ventasService.listarProductos(term || undefined).subscribe({
    next: (res) => {
      const base = (res ?? []) as ProductoDtoExt[];

      // Lista vacía: sin error. Si hay filtro, mostrar info.
      if (!base.length) {
        this.productos = [];
        if (term) this.showInfo('No hay productos que coincidan con la búsqueda.');
        return;
      }

      // Cargar base y luego disponibilidad
      this.productos = base.map(p => ({ ...p, reservado: null, disponible: null }));

      const ids = base.map(p => p.presentacionId);
      this.ventasService.disponibilidad(ids).subscribe({
        next: (rows: StockDisponibleDto[]) => {
          const map = new Map(rows.map(r => [r.presentacionId, r]));
          this.productos = this.productos.map(p => {
            const d = map.get(p.presentacionId);
            return d
              ? {
                  ...p,
                  reservado: Number(d.reservado || 0),
                  disponible: Number(d.disponible || 0),
                  precioVenta: p.precioVenta ?? d.precioVenta ?? null
                }
              : p;
          });
        },
        error: (e) => this.swalErrorFrom(e, 'No se pudo obtener disponibilidad'),
      });
    },
    error: (e) => {
      // Tratar 204/404 como "sin datos"
      if (e?.status === 204 || e?.status === 404) {
        this.productos = [];
        if (term) this.showInfo('No hay productos que coincidan con la búsqueda.');
        return;
      }
      this.swalErrorFrom(e, 'No se pudo cargar productos');
    },
  });
}

  filtrar() { this.cargarProductos(); }
  clearSearch() { this.filtro = ''; this.cargarProductos(); }

  // ===== Helpers de disponibilidad (stock - reservas - carrito) =====
  dispoDe(p: ProductoDtoExt): number {
    const d = Number(p.disponible ?? NaN);
    if (!Number.isNaN(d)) return Math.max(0, d);
    const stock = Number(p.cantidad ?? 0);
    const res   = Number(p.reservado ?? 0);
    return Math.max(0, stock - res);
  }

  enCarrito(presentacionId: number, omitIndex = -1): number {
    return this.seleccionados.reduce((acc, s, i) =>
      acc + (s.presentacionId === presentacionId && i !== omitIndex ? Number(s.cantidadVenta || 0) : 0), 0);
  }

  disponibleRestante(presentacionId: number, prod?: ProductoDtoExt, omitIndex = -1): number {
    const base = prod
      ? this.dispoDe(prod)
      : this.dispoDe(this.productos.find(p => p.presentacionId === presentacionId)!);
    return Math.max(0, base - this.enCarrito(presentacionId, omitIndex));
  }

  // ===== Carrito =====
  cancelarCarrito() {
    this.seleccionados = [];
    this.cargarProductos();
  }

  agregarProducto(p: ProductoDtoExt) {
    const dispRest = this.disponibleRestante(p.presentacionId, p);
    if (dispRest <= 0) {
      this.toast('warning', 'No hay disponible (reservado por pedidos)');
      return;
    }

    const idx = this.seleccionados.findIndex(s => s.presentacionId === p.presentacionId);
    if (idx >= 0) {
      const dispParaEse = this.disponibleRestante(p.presentacionId, p, idx);
      if (this.seleccionados[idx].cantidadVenta + 1 > dispParaEse) {
        this.toast('warning', 'No hay más disponible');
        return;
      }
      this.seleccionados[idx].cantidadVenta++;
    } else {
      if (1 > dispRest) { this.toast('warning', 'No hay más disponible'); return; }
      this.seleccionados.push({ ...p, cantidadVenta: 1 });
    }
  }

  quitarProducto(presentacionId: number) {
    this.seleccionados = this.seleccionados.filter(s => s.presentacionId !== presentacionId);
  }

  inc(s: ProductoDtoExt & { cantidadVenta: number }) {
    const idx = this.seleccionados.findIndex(x => x.presentacionId === s.presentacionId);
    const dispParaEse = this.disponibleRestante(s.presentacionId, undefined, idx);
    if (s.cantidadVenta + 1 > dispParaEse) { this.toast('warning', 'No hay más disponible'); return; }
    s.cantidadVenta = Number(s.cantidadVenta || 0) + 1;
  }

  dec(s: any) {
    s.cantidadVenta = Math.max(1, Number(s.cantidadVenta || 1) - 1);
  }

  onQtyInput(s: any, ev: Event, idx?: number) {
    const v = Math.floor(Number((ev.target as HTMLInputElement).value));
    const i = (typeof idx === 'number' && idx >= 0) ? idx : this.seleccionados.findIndex(x => x.presentacionId === s.presentacionId);
    const dispParaEse = this.disponibleRestante(s.presentacionId, undefined, i);

    if (!isFinite(v) || v <= 0) { s.cantidadVenta = 1; return; }
    s.cantidadVenta = Math.min(v, dispParaEse);
  }

  // ===== Cobro =====
  abrirCobro() {
    if (!this.seleccionados.length) return;

    this.fpSvc.list(true).subscribe({
      next: (fps) => {
        this.formasPago = fps || [];
        this.formaPagoId = this.formasPago[0]?.id ?? null;
        this.resetCamposPorFP();
      },
      error: () => this.toast('error', 'No se pudieron cargar las formas de pago'),
    });

    // Reset campos
    this.recibido = null;
    this.referencia = null;
    this.clienteId = null;
    this.clienteNombre = '';
    this.clienteSugerencias = [];

    this.showCobro = true;
  }

  cerrarCobro() { this.showCobro = false; }

  onFPChangeId(id: any) {
    this.formaPagoId = Number(id);
    this.resetCamposPorFP();
  }
  private resetCamposPorFP() {
    if (!this.fpRequiereRef) this.referencia = null;
    if (!this.esEfectivo) this.recibido = null;
  }

  // ===== Cliente Autocomplete =====
  onClienteInput() {
    this.clienteId = null;
    if (this.timer) clearTimeout(this.timer);
    const term = (this.clienteNombre || '').trim();
    if (!term) { this.clienteSugerencias = []; return; }
    this.timer = setTimeout(() => {
      this.ventasService.buscarClientes(term).subscribe({
        next: (list) => (this.clienteSugerencias = list || []),
        error: () => (this.clienteSugerencias = []),
      });
    }, 200);
  }
  seleccionarCliente(c: ClienteItem) {
    this.clienteId = c.id;
    this.clienteNombre = c.nombre;
    this.clienteSugerencias = [];
  }
  onClienteEnter(ev: Event) {
    ev.preventDefault?.();
    if (this.clienteSugerencias.length) {
      this.seleccionarCliente(this.clienteSugerencias[0]);
    }
  }

  // ===== Confirmar cobro =====
  confirmarCobro() {
    if (!this.seleccionados.length) return;

    if (!this.formaPagoId) { this.toast('warning', 'Selecciona forma de pago'); return; }

    if (this.fpRequiereRef && !this.referencia?.trim()) {
      this.toast('warning', 'Ingresa la referencia del depósito/transferencia');
      return;
    }

    if (this.esEfectivo) {
      const rec = Number(this.recibido || 0);
      if (rec < this.totalVenta) { this.toast('warning', 'Monto recibido insuficiente'); return; }
    }

    const dto: VentaCreate = {
      clienteId: this.clienteId || undefined,
      formaPagoId: this.formaPagoId!,
      observaciones: this.fpRequiereRef ? `Ref: ${this.referencia}` : undefined,
      items: this.seleccionados.map(s => ({
        presentacionId: s.presentacionId,
        cantidad: s.cantidadVenta,
        precioUnitario: Number(s.precioVenta || 0),
        descuentoUnitario: 0,
      })),
    };

    const nombreParaTicket =
      !this.clienteId && (this.clienteNombre || '').trim()
        ? (this.clienteNombre || '').trim()
        : undefined;

    this.ventasService.crearVenta(dto).subscribe({
      next: (res) => {
        this.abrirComprobante(res.id, nombreParaTicket);
        this.showCobro = false;
        this.seleccionados = [];
        this.cargarProductos();

        const nombre = (this.clienteNombre || '').trim();
        if (!this.clienteId && nombre) this.preguntarRegistrarCliente(nombre);
      },
      error: (err) => {
        if (err?.status === 409 && err?.error) {
          const pid = err.error.presentacionId;
          const prod = this.productos.find(p => p.presentacionId === pid);
          const nombre = prod?.producto || `#${pid}`;
          const requerido  = err.error.requerido ?? err.error.intento ?? '?';
          const stock      = err.error.stock ?? '?';
          const reservado  = err.error.reservado ?? '?';
          const disponible = err.error.disponible ?? '?';

          Swal.fire(
            'Sin disponible',
            `Para “${this.escape(nombre)}” no hay disponibilidad suficiente.\n` +
            `Requerido: ${requerido} · Stock: ${stock} · Reservado: ${reservado} · Disponible: ${disponible}`,
            'warning'
          );
          this.cargarProductos();
          return;
        }

        // Mostrar claramente el mensaje del backend si existe (p.ej. caja cerrada)
        const msg = err?.error?.message || err?.message || 'No se pudo registrar la venta';
        Swal.fire('Error', msg, 'error');
      },
    });
  }

  // ===== Comprobante =====
  private abrirComprobante(ventaId: number, clienteNombreManual?: string) {
    this.ventasService.getById(ventaId).subscribe({
      next: (v: VentaDetailDto) => {
        const clienteMostrar =
          (v.clienteNombre && v.clienteNombre.trim()) ||
          (clienteNombreManual && clienteNombreManual.trim()) ||
          'Consumidor Final';

        const filas = (v.items || []).map((it) => {
          const nombre = (it as any).productoNombre || it.presentacionNombre || '';
          const cant = Number(it.cantidad || 0);
          const pUnit = Number(it.precioUnitario || 0);
          const sub = Number((it as any).totalLinea ?? (cant * pUnit));
          return `
          <tr>
            <td>${this.escape(nombre)}</td>
            <td style="text-align:center">${cant}</td>
            <td style="text-align:right">Q ${pUnit.toFixed(2)}</td>
            <td style="text-align:right">Q ${sub.toFixed(2)}</td>
          </tr>`;
        }).join('');

        const totalNum = Number(v.total ?? 0);
        const recibidoLocal = Number(this.recibido || 0);
        const cambioLocal = Math.max(0, recibidoLocal - totalNum);

        const detalleFP = `
          <div style="margin-top:8px">
            <div>Forma de pago: <strong>${this.escape(v.formaPagoNombre || '')}</strong></div>
            ${this.fpRequiereRef && this.referencia ? `<div>Depósito/Trans.: <strong>${this.escape(this.referencia)}</strong></div>` : ''}
            ${this.esEfectivo ? `
              <div>Recibido: Q ${recibidoLocal.toFixed(2)}</div>
              <div>Cambio: Q ${cambioLocal.toFixed(2)}</div>` : ''}
          </div>`;

        const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comprobante</title>
  <style>
    :root{ --paper-w: 720px; }
    @page{ size: auto; margin: 10mm; }
    body{ font-family: Arial, Helvetica, sans-serif; color:#111; }
    .ticket{ width: var(--paper-w); margin: 0 auto; }
    .hdr{ text-align:center; margin-bottom:14px; }
    .brand-wrap{ display:inline-block; position:relative; }
    .brand{ font-family:"Playfair Display", Georgia, serif; color:#c2185b; font-size:32px; font-weight:700; }
    .logo-near{ position:absolute; top:50%; left:100%; transform:translate(12px,-50%); width:46px; height:46px; object-fit:contain; }
    .small{ color:#666; font-size:12px; margin-top:6px; }
    .meta{ margin:10px 0 12px; text-align:center; }
    .num{ color:#a000a0; font-weight:700; margin-bottom:8px; }
    table{ width:100%; border-collapse: collapse; }
    th,td{ padding:8px; border-bottom:1px solid #ddd; font-size:14px; }
    th{ background:#f7e9f8; text-align:left; }
    .tot{ margin-top:12px; text-align:right; font-weight:700; font-size:16px; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="num">COMP-${new Date().toISOString().slice(0,10).replaceAll('-','')}</div>

    <div class="hdr">
      <div class="brand-wrap">
        <span class="brand">${this.escape(this.empresa.nombre)}</span>
        ${this.empresa.logoUrl ? `<img class="logo-near" src="${this.empresa.logoUrl}" alt="logo" />` : ''}
      </div>
      <div class="small">${this.escape(this.empresa.direccion)} • ${this.empresa.email} • ${this.empresa.telefono}</div>
    </div>

    <div class="meta">
      <div>Cliente: <strong>${this.escape(clienteMostrar)}</strong></div>
      ${v.serie || v.numero ? `<div>Documento: ${this.escape(v.serie || '')} ${this.escape(v.numero || '')}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr><th>Producto</th><th style="text-align:center">Cantidad</th><th style="text-align:right">Precio unitario</th><th style="text-align:right">Subtotal</th></tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>

    <div class="tot">Total: Q ${totalNum.toFixed(2)}</div>
    ${detalleFP}
  </div>
  <script>window.addEventListener('load', () => { window.print(); });</script>
</body>
</html>`;
        const w = window.open('', '_blank');
        if (!w) { this.toast('error', 'Tu navegador bloqueó la ventana de impresión'); return; }
        w.document.open(); w.document.write(html); w.document.close(); w.focus();
      },
      error: () => this.toast('error', 'No se pudo generar el comprobante'),
    });
  }

  // ===== Registrar cliente post-venta =====
  private async preguntarRegistrarCliente(nombreInicial: string) {
    const validarEmail = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const validarNit   = (n: string) => !n || /^\d{9}$/.test(n);
    const validarTel   = (t: string) => /^\d{8}$/.test(t);

    const result = await Swal.fire({
      title: '¿Registrar cliente?',
      html: `
        <style>
          .swal2-popup { border-radius:16px !important; }
          .swal2-input.nice{
            height:48px; border-radius:12px; border:1px solid #e5e7eb;
            box-shadow:0 1px 2px rgba(0,0,0,.04); padding:0 14px;
          }
          .swal2-input.nice:focus{
            border-color:#e91e63; box-shadow:0 0 0 3px rgba(233,30,99,.15);
          }
        </style>
        <input id="swal-nombre" class="swal2-input nice" placeholder="Nombre *" value="${this.escape(nombreInicial)}" maxlength="60">
        <input id="swal-nit" class="swal2-input nice"
               placeholder="NIT (9 dígitos)"
               inputmode="numeric" maxlength="9"
               oninput="this.value=this.value.replace(/\\D/g,'').slice(0,9)">
        <input id="swal-tel" class="swal2-input nice"
               placeholder="Teléfono (8 dígitos) *"
               inputmode="numeric" maxlength="8"
               oninput="this.value=this.value.replace(/\\D/g,'').slice(0,8)">
        <input id="swal-email" class="swal2-input nice" placeholder="Email" maxlength="80">
        <input id="swal-dir" class="swal2-input nice" placeholder="Dirección" maxlength="120">
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Ahora no',
      allowOutsideClick: () => !Swal.isLoading(),
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        const nombre = (document.getElementById('swal-nombre') as HTMLInputElement).value.trim().slice(0,60);
        const nit    = (document.getElementById('swal-nit')    as HTMLInputElement).value.trim().replace(/\D/g,'').slice(0,9);
        const tel    = (document.getElementById('swal-tel')    as HTMLInputElement).value.trim().replace(/\D/g,'').slice(0,8);
        const email  = (document.getElementById('swal-email')  as HTMLInputElement).value.trim().slice(0,80);
        const dir    = (document.getElementById('swal-dir')    as HTMLInputElement).value.trim().slice(0,120);

        if (!nombre)                 { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
        if (!/^\d{8}$/.test(tel))    { Swal.showValidationMessage('El teléfono es obligatorio y debe tener 8 dígitos'); return false; }
        if (!(nit === '' || validarNit(nit))) { Swal.showValidationMessage('El NIT debe tener 9 dígitos'); return false; }
        if (!validarEmail(email))    { Swal.showValidationMessage('Email inválido'); return false; }

        try {
          await firstValueFrom(this.cliSvc.create({
            nombre,
            nit: nit || null,
            telefono: tel,
            email: email || null,
            direccion: dir || null,
            notas: null,
            activo: true
          } as any));
          return true;
        } catch (err: any) {
          if (err?.status === 409) {
            Swal.showValidationMessage(err?.error?.message || 'NIT o Email ya existe.');
            return false;
          }
          Swal.showValidationMessage('No se pudo guardar el cliente.');
          return false;
        }
      }
    });

    if (result.isConfirmed) this.toast('success', 'Cliente registrado');
  }

  // ===== Utils =====
  trackByProducto = (_: number, it: ProductoDtoExt) => it.presentacionId;
  trackBySel = (_: number, it: { presentacionId: number }) => it.presentacionId;

  private toast(icon: 'success'|'error'|'info'|'warning', title: string) {
    const T = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true });
    T.fire({ icon, title });
  }
  private escape(s: string) {
    return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]!));
  }
  toNumber(v: any): number { return Number(v ?? 0); }
}
