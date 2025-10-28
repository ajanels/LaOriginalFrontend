import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { UsuariosService, Usuario } from '../../../services/usuarios.service';
import { RolesService, Rol } from '../../../services/roles.service';
import { UsuarioModalComponent, ModalMode } from '../usuario-modal/usuario-modal';

@Component({
  standalone: true,
  selector: 'app-usuarios',
  imports: [CommonModule, FormsModule, UsuarioModalComponent],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.css'],
})
export class UsuariosComponent implements OnInit {
  private api = inject(UsuariosService);
  private rolesApi = inject(RolesService);

  loading = signal(false);
  rows = signal<Usuario[]>([]);
  roles = signal<Rol[]>([]);

  // filtros
  q = signal<string>('');
  estado = signal<string>('');             // 'Activo' | 'Inactivo' | ''
  rolId = signal<number | null>(null);

  // filtros avanzados
  showFilters = signal(false);
  fPrimer   = signal<string>('');
  fSegundo  = signal<string>('');
  fApellidos= signal<string>('');
  fNit      = signal<string>('');
  fFechaIng = signal<string>('');          // yyyy-MM-dd

  // modal
  show = signal(false);
  mode = signal<ModalMode>('create');
  current = signal<Usuario | null>(null);

  // paginación fija a 5
  page = signal<number>(1);
  pageSize = signal<number>(5);

  toggleFilters(){ this.showFilters.set(!this.showFilters()); }
  onNitFilter(v: string){ this.fNit.set((v || '').replace(/\D+/g, '').slice(0,9)); }

  filtered = computed(() => {
    const term = this.q().trim().toLowerCase();
    const est  = this.estado().trim();                // comparar tal cual viene del select
    const rid  = this.rolId();

    const f1 = this.fPrimer().trim().toLowerCase();
    const f2 = this.fSegundo().trim().toLowerCase();
    const fa = this.fApellidos().trim().toLowerCase();
    const fn = this.fNit().trim();
    const ff = this.fFechaIng().trim();               // yyyy-MM-dd

    return this.rows().filter(u => {
      const fullName = `${u.primerNombre} ${u.segundoNombre ?? ''} ${u.primerApellido} ${u.segundoApellido ?? ''}`.toLowerCase();
      const hayTerm =
        !term ||
        fullName.includes(term) ||
        (u.username ?? '').toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term);

      const hayEstado = !est || (u.estado ?? '') === est;
      const hayRol = !rid || (u.rol?.id === rid);

      const okPrimer  = !f1 || (u.primerNombre ?? '').toLowerCase().includes(f1);
      const okSegundo = !f2 || (u.segundoNombre ?? '').toLowerCase().includes(f2);
      const okApell   = !fa || (`${u.primerApellido ?? ''} ${u.segundoApellido ?? ''}`.toLowerCase().includes(fa));
      const okNit     = !fn || (u.nit ?? '').startsWith(fn);

      // Normaliza fechaIngreso si viene como Date o como string ISO
      let ingresoStr = '';
      const anyU: any = u as any;
      if (anyU?.fechaIngreso) {
        try {
          ingresoStr = new Date(anyU.fechaIngreso).toISOString().slice(0, 10);
        } catch { ingresoStr = ''; }
      }
      const okFecha   = !ff || ingresoStr === ff;

      return hayTerm && hayEstado && hayRol && okPrimer && okSegundo && okApell && okNit && okFecha;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  paged = computed(() => {
    const max = this.totalPages();
    if (this.page() > max) this.page.set(1);
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  ngOnInit(): void {
    this.reload();
    this.loadRoles();
  }

  reload() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: list => { this.rows.set(list); this.loading.set(false); },
      error: () => { this.loading.set(false); Swal.fire('Error','No se pudo cargar usuarios','error'); }
    });
  }

  loadRoles() {
    this.rolesApi.list().subscribe({
      next: list => this.roles.set(list),
      error: () => {}
    });
  }

  nextPage(){ if (this.page() < this.totalPages()) this.page.update(p => p + 1); }
  prevPage(){ if (this.page() > 1) this.page.update(p => p - 1); }

  openCreate(){ this.mode.set('create'); this.current.set(null); this.show.set(true); }
  openEdit(u: Usuario){
    this.mode.set('edit'); this.loading.set(true);
    this.api.get(u.id).subscribe({
      next: full => { this.current.set(full); this.show.set(true); this.loading.set(false); },
      error: () => { this.loading.set(false); Swal.fire('Error','No se pudo cargar el usuario','error'); }
    });
  }
  openView(u: Usuario){
    this.mode.set('view'); this.loading.set(true);
    this.api.get(u.id).subscribe({
      next: full => { this.current.set(full); this.show.set(true); this.loading.set(false); },
      error: () => { this.loading.set(false); Swal.fire('Error','No se pudo cargar el usuario','error'); }
    });
  }
  onClose(refresh: boolean){ this.show.set(false); this.current.set(null); if (refresh) this.reload(); }
}
