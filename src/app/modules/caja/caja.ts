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

  // División en dos columnas (cierre)
  mid = computed(() => Math.ceil(this.denoms().length / 2));
  denomsCols = computed(() => {
    const a = this.denoms();
    const m = this.mid();
    return [a.slice(0, m), a.slice(m)];
  });

  // Validación cierre (tolerancia de centavos)
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

  // Ajuste automático (última denominación editada)
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
  aCajero     = signal<string>(''); // no se envía salvo que decidas forzarlo

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
    effect(() => {
      const _ = [this.q(), this.tipo(), this.desde(), this.hasta(), this.estado()];
      if (this.estado()?.aperturaId != null) this.loadMovs();
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
    } catch {
      this.resumen.set(null);
      this.movs.set([]);
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
    } catch {
      this.movs.set([]);
    }
  }

  async loadSesiones() {
    try {
      const s = await firstValueFrom(this.cajaApi.sesiones());
      this.sesiones.set((s as CajaSesionListItemUI[]) || []);
    } catch {
      this.sesiones.set([]);
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

      // Mensaje bonito con resumen de cierre
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
        // cajeroNombre: this.aCajero() || undefined
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

  /* ========== Util: obtener nombre del JWT en localStorage ========== */
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

  /* ========== SweetAlert helpers ========== */
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

  private fmtQ(v: number | string): string {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return 'Q —';
    return `Q ${n.toFixed(2)}`;
  }

  /** Traduce respuestas del backend (incluye ModelState y FondosInsuficientes). */
  private extractError(e: any): string {
    try {
      if (e?.status === 0) return 'No hay conexión con el servidor.';

      const err = e?.error;

      // String plano
      if (typeof err === 'string') return err;

      // Nuestra excepción de fondos insuficientes (CajaController devuelve { error, disponible, solicitado })
      if (err?.error && typeof err.error === 'string' &&
          err.error.toLowerCase().includes('fondos insuficientes')) {
        const disp = +(+err.disponible || 0).toFixed(2);
        const soli = +(+err.solicitado || 0).toFixed(2);
        return `Fondos insuficientes. Disponible ${this.fmtQ(disp)}, solicitado ${this.fmtQ(soli)}.`;
      }

      // ModelState: { errors: { campo: [msg,msg] } }
      if (err?.errors && typeof err.errors === 'object') {
        const lines: string[] = [];
        for (const k of Object.keys(err.errors)) {
          const msgs = err.errors[k];
          if (Array.isArray(msgs)) msgs.forEach((m: any) => lines.push(`${k}: ${m}`));
        }
        if (lines.length) return lines.join(' | ');
      }

      // Campos comunes
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
}
