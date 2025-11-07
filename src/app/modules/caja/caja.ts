import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import {
  CajaService,
  CajaEstado,
  CajaResumen,
  CajaMovimiento,
  CajaSesionListItem,
} from '../../services/caja.service';

/* ===== Extensiones UI para campos locales ===== */
type CajaEstadoUI = CajaEstado & {
  timeZoneId?: string | null;
  aperturaLocal?: string | Date | null;
  aperturaLocalIso?: string | null;
};

type CajaResumenUI = CajaResumen & {
  timeZoneId?: string | null;
  fechaAperturaLocal?: string | Date;
  fechaCierreLocal?: string | Date | null;
  fechaAperturaLocalIso?: string | null;
  fechaCierreLocalIso?: string | null;
};

type CajaMovimientoUI = CajaMovimiento & {
  timeZoneId?: string | null;
  fechaLocal?: string | Date;
  fechaLocalIso?: string | null;
};

type CajaSesionListItemUI = CajaSesionListItem & {
  timeZoneId?: string | null;
  aperturaLocal?: string | Date;
  aperturaLocalIso?: string | null;
};

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './caja.html',
  styleUrls: ['./caja.css'],
})
export class CajaComponent {
  private cajaApi = inject(CajaService);

  // ===== Signals =====
  estado   = signal<CajaEstadoUI | null>(null);
  resumen  = signal<CajaResumenUI | null>(null);
  movs     = signal<CajaMovimientoUI[]>([]);
  sesiones = signal<CajaSesionListItemUI[]>([]);

  // ---- Paginación de sesiones ----
  sesPage     = signal<number>(0);
  sesPageSize = signal<number>(4);

  sesionesTotal = computed(() => this.sesiones().length);
  sesionesTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.sesionesTotal() / this.sesPageSize()))
  );

  sesionesPaged = computed(() => {
    const list = this.sesiones();
    const size = this.sesPageSize();
    const lastIndex = Math.max(0, this.sesionesTotalPages() - 1);
    const page = Math.min(this.sesPage(), lastIndex);
    const start = page * size;
    return list.slice(start, start + size);
  });

  sesRangeStart = computed(() =>
    this.sesionesTotal() ? this.sesPage() * this.sesPageSize() + 1 : 0
  );
  sesRangeEnd = computed(() =>
    Math.min(this.sesionesTotal(), (this.sesPage() + 1) * this.sesPageSize())
  );
  sesCanPrev = computed(() => this.sesPage() > 0);
  sesCanNext = computed(() => this.sesPage() < this.sesionesTotalPages() - 1);

  setSesPageSize(n: number) {
    const allowed = [2, 3, 4];
    const size = allowed.includes(Number(n)) ? Number(n) : 4;
    this.sesPageSize.set(size);
    this.sesPage.set(0);
  }

  sesPrev() { if (this.sesCanPrev()) this.sesPage.set(this.sesPage() - 1); }
  sesNext() { if (this.sesCanNext()) this.sesPage.set(this.sesPage() + 1); }

  // ===== Filtros / búsqueda de movimientos =====
  q      = signal<string>('');
  tipo   = signal<number | null>(null);
  desde  = signal<string | null>(null);
  hasta  = signal<string | null>(null);

  loading = signal<boolean>(false);

  // ===== Usuario actual (para mostrar cajero en apertura) =====
  userName = signal<string>(this.getUserNameFromJwt() ?? '');

  // ===== Modales: GASTO =====
  showGasto   = signal(false);
  gMonto      = signal<number>(0);
  gConcepto   = signal<string>('');
  gObs        = signal<string | null>(null);

  // ===== Modales: CIERRE =====
  showCierre  = signal(false);
  denoms = signal<Array<{ valor: number; qty: number }>>([
    { valor: 200, qty: 0 }, { valor: 100, qty: 0 }, { valor: 50, qty: 0 },
    { valor: 20,  qty: 0 }, { valor: 10,  qty: 0 }, { valor: 5,  qty: 0 },
    { valor: 1,   qty: 0 }, { valor: 0.50, qty: 0 }, { valor: 0.25, qty: 0 },
    { valor: 0.10, qty: 0 },{ valor: 0.05, qty: 0 },
  ]);
  conteo = computed(() =>
    +this.denoms().reduce((acc, d) => acc + d.valor * d.qty, 0).toFixed(2)
  );

  mid = computed(() => Math.ceil(this.denoms().length / 2));
  denomsCols = computed(() => {
    const a = this.denoms();
    const m = this.mid();
    return [a.slice(0, m), a.slice(m)];
  });

  canCerrar = computed(() => {
    const r = this.resumen();
    if (!r) return false;
    const c = +this.conteo().toFixed(2);
    const e = +r.esperado.toFixed(2);
    return Math.abs(c - e) <= 0.01;
  });

  diferencia = computed(() => {
    const r = this.resumen();
    if (!r) return 0;
    return +(this.conteo() - r.esperado).toFixed(2);
  });

  lastEditedIdx = signal<number | null>(null);
  canAdjust = computed(() => {
    const idx = this.lastEditedIdx();
    const r = this.resumen();
    if (idx == null || !r) return false;
    const d = this.denoms()[idx];
    if (!d) return false;

    const delta = +(r.esperado - this.conteo()).toFixed(2);
    const step = +(delta / d.valor).toFixed(6);
    return Math.abs(step - Math.round(step)) < 1e-6;
  });

  // ===== Modales: APERTURA =====
  showApertura = signal(false);
  aMonto      = signal<number>(0);
  aObs        = signal<string | null>(null);
  aCajero     = signal<string>('');

  // Etiquetas/clases por tipo
  tipoLabel(n: number): string {
    switch (n) {
      case 0: return 'Apertura';
      case 1: return 'Cierre';
      case 2: return 'Ingreso';
      case 3: return 'Egreso';
      case 4: return 'Cobro venta';
      case 5: return 'Pago proveedor';
      default: return '—';
    }
  }
  tipoClass(n: number): string {
    switch (n) {
      case 0: return 'pill open';
      case 1: return 'pill close';
      case 2: return 'pill in';
      case 3: return 'pill out';
      case 4: return 'pill in';
      case 5: return 'pill out';
      default: return 'pill';
    }
  }

  trackByMov    = (_: number, m: CajaMovimientoUI) => m.id;
  trackBySesion = (_: number, s: CajaSesionListItemUI) => s.id;

  constructor() {
    this.refreshAll();

    // recargar movimientos al cambiar filtros/estado
    effect(() => {
      const _ = [this.q(), this.tipo(), this.desde(), this.hasta(), this.estado()];
      if (this.estado()?.aperturaId != null) this.loadMovs();
    });

    // clampa la página cuando cambian sesiones o pageSize
    effect(() => {
      const totalPages = this.sesionesTotalPages();
      const page = this.sesPage();
      if (page > totalPages - 1) {
        this.sesPage.set(Math.max(0, totalPages - 1));
      }
    });
  }

  /* ========== CARGA ========== */
  async refreshAll() {
    this.loading.set(true);
    try {
      const est = await firstValueFrom(this.cajaApi.estado());
      this.estado.set(est as CajaEstadoUI ?? null);

      if (est?.aperturaId != null) {
        const res = await firstValueFrom(this.cajaApi.resumen(est.aperturaId));
        this.resumen.set(res as CajaResumenUI ?? null);
      } else {
        this.resumen.set(null);
      }

      await this.loadMovs();
      await this.loadSesiones();
      this.sesPage.set(0);
    } catch (e: any) {
      this.resumen.set(null);
      this.movs.set([]);
      this.swalErrorFrom(e, 'No se pudo cargar la caja');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMovs() {
    const e = this.estado();
    if (!e?.aperturaId) { this.movs.set([]); return; }

    try {
      const rows = await firstValueFrom(this.cajaApi.movimientos({
        aperturaId: e.aperturaId,
        q: this.q() || undefined,
        tipo: this.tipo() ?? undefined,
        desde: this.desde() || undefined,
        hasta: this.hasta() || undefined,
      }));
      this.movs.set((rows as CajaMovimientoUI[]) || []);
    } catch (e: any) {
      this.movs.set([]);
      this.Toast.fire({ icon: 'error', title: 'No se pudieron cargar los movimientos' });
    }
  }

  async loadSesiones() {
    try {
      const s = await firstValueFrom(this.cajaApi.sesiones());
      this.sesiones.set((s as CajaSesionListItemUI[]) || []);
    } catch (e: any) {
      this.sesiones.set([]);
      this.Toast.fire({ icon: 'error', title: 'No se pudieron cargar las sesiones' });
    }
  }

  async refrescar() { await this.refreshAll(); }

  /* ========== GASTO ========== */
  openGasto() {
    this.gMonto.set(0);
    this.gConcepto.set('');
    this.gObs.set(null);
    this.showGasto.set(true);
  }
  closeGasto() { this.showGasto.set(false); }

  async saveGasto() {
    const monto = +this.gMonto() || 0;
    if (monto <= 0) return;

    try {
      await firstValueFrom(this.cajaApi.registrarGasto({
        monto,
        concepto: (this.gConcepto().trim() || 'Gasto'),
        observaciones: (this.gObs() || undefined),
      }));
      this.showGasto.set(false);
      this.Toast.fire({ icon: 'success', title: 'Gasto registrado' });
      await this.refreshAll();
    } catch (e: any) {
      this.showGasto.set(false);
      this.swalErrorFrom(e, 'No se pudo registrar el gasto');
    }
  }

  /* ========== CIERRE ========== */
  openCierre() {
    this.denoms.set(this.denoms().map(d => ({ ...d, qty: 0 })));
    this.lastEditedIdx.set(null);
    this.showCierre.set(true);
  }
  closeCierre() { this.showCierre.set(false); }

  async confirmarCierre() {
    const total = this.conteo();
    try {
      const res: any = await firstValueFrom(this.cajaApi.cerrar({
        montoConteo: +total.toFixed(2),
        observaciones: undefined,
      }));
      this.showCierre.set(false);

      const esperado = +(res?.esperado ?? 0);
      const conteo   = +(res?.conteo ?? +total.toFixed(2));
      const dif      = +(res?.diferencia ?? +(conteo - esperado).toFixed(2));

      await Swal.fire({
        icon: Math.abs(dif) <= 0.01 ? 'success' : 'info',
        title: 'Caja cerrada',
        html: `
          <div style="text-align:left">
            <p><b>Esperado:</b> ${this.fmtQ(esperado)}</p>
            <p><b>Conteo:</b> ${this.fmtQ(conteo)}</p>
            <p><b>Diferencia:</b> ${this.fmtQ(dif)}</p>
          </div>`,
        confirmButtonText: 'Entendido'
      });

      await this.refreshAll();
    } catch (e: any) {
      this.showCierre.set(false);
      this.swalErrorFrom(e, 'No se pudo cerrar la caja');
    }
  }

  setQty(idx: number, raw: any) {
    const n = +raw || 0;
    const arr = this.denoms().slice();
    arr[idx] = { ...arr[idx], qty: n };
    this.denoms.set(arr);
    this.lastEditedIdx.set(idx);
  }

  adjustToExpected() {
    const idx = this.lastEditedIdx();
    const r = this.resumen();
    if (idx == null || !r) return;

    const arr = this.denoms().slice();
    const d = arr[idx];

    const delta = +(r.esperado - this.conteo()).toFixed(2);
    const stepsFloat = delta / d.valor;
    const steps = Math.round(stepsFloat);

    if (Math.abs(stepsFloat - steps) > 1e-6) return;

    const newQty = Math.max(0, d.qty + steps);
    arr[idx] = { ...d, qty: newQty };
    this.denoms.set(arr);
  }

  /* ========== APERTURA ========== */
  openApertura() {
    this.aMonto.set(0);
    this.aObs.set(null);
    const name = this.userName() || '';
    this.aCajero.set(name);
    this.showApertura.set(true);
  }
  closeApertura() { this.showApertura.set(false); }

  async confirmarApertura() {
    const monto = +this.aMonto() || 0;
    if (monto <= 0) return;

    try {
      const res: any = await firstValueFrom(this.cajaApi.abrir({
        montoInicial: +monto.toFixed(2),
        observaciones: (this.aObs() || undefined),
      }));
      this.showApertura.set(false);
      const codigo = res?.codigo ?? res?.Codigo ?? null;
      this.Toast.fire({ icon: 'success', title: codigo ? `Caja abierta (${codigo})` : 'Caja abierta' });
      await this.refreshAll();
    } catch (e: any) {
      this.showApertura.set(false);
      this.swalErrorFrom(e, 'No se pudo abrir la caja');
    }
  }

  /* ========== Helpers filtros ========== */
  clearFiltros() {
    this.q.set('');
    this.tipo.set(null);
    this.desde.set(null);
    this.hasta.set(null);
  }

  private getUserNameFromJwt(): string | null {
    try {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('id_token');

      if (!token || token.split('.').length < 2) return null;
      const payloadB64 = token.split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(token.split('.')[1].length / 4) * 4, '=');
      const json = atob(payloadB64);
      const claims = JSON.parse(json);

      const name   = (claims['name'] || claims['unique_name'] || '').trim();
      const given  = (claims['given_name'] || claims['PrimerNombre'] || '').trim();
      const family = (claims['family_name'] || claims['PrimerApellido'] || '').trim();

      const full = (name || `${given} ${family}`.trim()).trim();
      return full || claims['sub'] || null;
    } catch {
      return null;
    }
  }

  /* ========== SweetAlert / Error helpers ========== */
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

  private fmtQ(n: any): string {
    const num = Number(n ?? 0);
    try {
      return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2
      }).format(num);
    } catch {
      return `Q ${(+num).toFixed(2)}`;
    }
  }

  /** Construye una vista rica para el error (cuando aplica) */
  private buildErrorView(e: any): { text?: string; html?: string } {
    if (e?.status === 0) return { text: 'No hay conexión con el servidor.' };

    const err = e?.error;

    // Caso típico: fondos insuficientes con disponible/solicitado
    if (e?.status === 409 && err && typeof err === 'object'
        && 'error' in err && 'disponible' in err && 'solicitado' in err) {
      const disp = this.fmtQ(err.disponible);
      const sol  = this.fmtQ(err.solicitado);
      return {
        html: `
          <div style="text-align:left">
            <p><strong>${(err.error || 'Fondos insuficientes')}</strong></p>
            <ul style="margin:0;padding-left:18px">
              <li><b>Disponible:</b> ${disp}</li>
              <li><b>Intentaste registrar:</b> ${sol}</li>
            </ul>
            <p style="margin-top:10px;color:#666" class="small">
              Ajusta el monto o registra una entrada antes del egreso.
            </p>
          </div>`
      };
    }

    if (typeof err === 'string') return { text: err };
    if (err?.detail || err?.title || err?.message) {
      return { text: (err.detail || err.title || err.message) };
    }

    // Modelo de validación: err.errors = { campo: [msg1, msg2] }
    if (err?.errors && typeof err.errors === 'object') {
      const items: string[] = [];
      Object.entries(err.errors).forEach(([k, v]: any) => {
        if (Array.isArray(v)) v.forEach((m: any) => items.push(`${k}: ${String(m)}`));
        else if (v != null) items.push(`${k}: ${String(v)}`);
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
}
