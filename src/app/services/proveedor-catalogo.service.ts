import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CatalogoItem {
  presentacionId: number;
  productoId: number;
  productoNombre: string;

  // Se mantiene porque se usa en el detalle del pedido
  presentacionNombre: string;
  unidad: string;

  // NUEVO: para mostrar la imagen en el catálogo del proveedor
  fotoUrl?: string | null;

  color?: string | null;
  sku?: string | null;
  codigoBarras?: string | null;
  codigoProveedor?: string | null;
  precioSugerido?: number | null;
  activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProveedorCatalogoService {
  private http = inject(HttpClient);

  list(proveedorId: number, opts?: { term?: string; soloActivos?: boolean }): Observable<CatalogoItem[]> {
    let p = new HttpParams();
    if (opts?.term) p = p.set('term', opts.term);
    if (opts?.soloActivos != null) p = p.set('soloActivos', String(opts.soloActivos));
    const url = `${environment.apiBase}/Proveedores/${proveedorId}/Catalogo`;
    return this.http.get<CatalogoItem[]>(url, { params: p });
  }
}
