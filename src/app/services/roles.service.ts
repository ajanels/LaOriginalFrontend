import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Rol { id: number; nombre: string; estado?: string; }

@Injectable({ providedIn: 'root' })
export class RolesService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/roles`;

  list(): Observable<Rol[]> {
    return this.http.get<Rol[]>(this.API);
  }
}
