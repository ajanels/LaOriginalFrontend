import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/* ================== MODELOS ================== */
export interface CajaEstado {
  abierta: boolean;
  // compat
  aperturaId?: number | null;
  fechaAperturaUtc?: string | null;
  montoInicial?: number | null;
  // extendidas
  sesionId?: number | null;
  codigo?: string | null;
  apertura?: string | null; // ISO local/UTC
  cajeroNombre?: string | null;
  capitalLiquido: number;
  efectivoInicial: number;
}

export interface CajaResumen {
  aperturaId: number;
  fechaAperturaUtc: string;
  fechaCierreUtc?: string | null;
  montoInicial: number;
  ingresos: number;
  egresos: number;
  esperado: number;
  conteo?: number | null;
  diferencia?: number | null;
}

export interface CajaMovimiento {
  id: number;
  cajaAperturaId: number;
  fechaUtc: string;         // ISO
  tipo: number;             // 0=Apertura,1=Cierre,2=Ingreso,3=Egreso,4=Cobro venta,5=Pago proveedor
  monto: number;
  concepto?: string | null;
  observaciones?: string | null;
  documento?: string | null;
  documentoId?: number | null;
  usuarioId?: number | null;
}

export interface CajaSesionListItem {
  id: number;
  codigo: string;
  apertura: string; // ISO
  cajeroNombre?: string | null;
  estado: 'Abierta' | 'Cerrada';
}

/* ===== Bodies ===== */
export interface AbrirCajaBody {
  montoInicial: number;
  observaciones?: string | null;
  cajeroNombre?: string | null;
}

export interface CerrarCajaBody {
  montoConteo: number;
  observaciones?: string | null;
}

export interface CrearMovimientoBody {
  tipo: number;
  monto: number;
  concepto?: string | null;
  observaciones?: string | null;
  documento?: string | null;
  documentoId?: number | null;
}

export interface RegistrarGastoBody {
  monto: number;
  concepto?: string | null;
  observaciones?: string | null;
}

/* ================== SERVICIO ================== */
@Injectable({ providedIn: 'root' })
export class CajaService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/caja`;

  estado(): Observable<CajaEstado> {
    return this.http.get<CajaEstado>(`${this.API}/estado`);
  }

  resumen(aperturaId?: number): Observable<CajaResumen> {
    let params = new HttpParams();
    if (aperturaId) params = params.set('aperturaId', String(aperturaId));
    return this.http.get<CajaResumen>(`${this.API}/resumen`, { params });
  }

  sesiones(q?: string): Observable<CajaSesionListItem[]> {
    let params = new HttpParams();
    if (q && q.trim()) params = params.set('q', q.trim());
    return this.http.get<CajaSesionListItem[]>(`${this.API}/sesiones`, { params });
  }

  movimientos(opts?: {
    aperturaId?: number;
    desde?: string; // ISO
    hasta?: string; // ISO
    tipo?: number;
    q?: string;
  }): Observable<CajaMovimiento[]> {
    let params = new HttpParams();
    if (opts?.aperturaId)  params = params.set('aperturaId', String(opts.aperturaId));
    if (opts?.desde)       params = params.set('desde', opts.desde);
    if (opts?.hasta)       params = params.set('hasta', opts.hasta);
    if (opts?.tipo != null) params = params.set('tipo', String(opts.tipo));
    if (opts?.q && opts.q.trim()) params = params.set('q', opts.q.trim());
    return this.http.get<CajaMovimiento[]>(`${this.API}/movimientos`, { params });
  }

  abrir(body: AbrirCajaBody) {
    return this.http.post<{ id: number; codigo: string }>(`${this.API}/abrir`, body);
  }

  cerrar(body: CerrarCajaBody) {
    return this.http.post(`${this.API}/cerrar`, body);
  }

  crearMovimiento(body: CrearMovimientoBody) {
    return this.http.post<CajaMovimiento>(`${this.API}/movimientos`, body);
  }

  registrarGasto(body: RegistrarGastoBody) {
    return this.http.post<CajaMovimiento>(`${this.API}/gastos`, body);
  }
}
