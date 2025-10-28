import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface StockRow {
  presentacionId: number;
  productoId: number;
  producto: string;
  productoCodigo?: string;
  fotoUrl?: string;
  cantidad: number;
  minimo?: number;
  bajoMinimo: boolean;
}

export interface KardexItem {
  id: number;
  fechaUtc: string;
  tipo: string;
  cantidad: number;
  costoUnitario?: number;
  precioUnitario?: number;
  documento?: string;
  documentoId?: number;
  notas?: string;
}

export interface AjusteInventarioDto {
  presentacionId: number;
  cantidad: number;
  tipo: 'entrada' | 'salida';
  motivo?: string;
  costoUnitario?: number | null;
}

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private http = inject(HttpClient);

  getStock(): Observable<StockRow[]> {
    return this.http.get<StockRow[]>(`${environment.apiBase}/inventario/stock`);
  }

  getKardex(presentacionId: number, desde?: string, hasta?: string): Observable<KardexItem[]> {
    return this.http.get<KardexItem[]>(`${environment.apiBase}/inventario/kardex`, {
      params: { presentacionId, desde: desde || '', hasta: hasta || '' }
    });
  }

  postAjuste(dto: AjusteInventarioDto): Observable<any> {
    return this.http.post(`${environment.apiBase}/inventario/ajuste`, dto);
  }

  actualizarMinimo(presentacionId: number, minimo: number): Observable<any> {
    return this.http.put(`${environment.apiBase}/inventario/stock/${presentacionId}/minimo`, { minimo });
  }
}
