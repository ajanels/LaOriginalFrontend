import { Component, OnInit, signal, computed, inject, effect } from '@angular/core';
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
  estado = signal<string>('');             // 'Activo' | 'Inactivo' | 'Suspendido' | ''
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

  // ===== Paginación estilo "Pedidos": índice 0-based y tamaño fijo 8 =====
  page = signal<number>(0);
  pageSize = signal<number>(8);

  toggleFilters(){ this.showFilters.set(!this.showFilters()); }
  onNitFilter(v: string){ this.fNit.set((v || '').replace(/\D+/g, '').slice(0,9)); }

  filtered = computed(() => {
    const term = this.q().trim().toLowerCase();
    const est  = this.estado().trim();
    const rid  = this.rolId();

    const f1 = this.fPrimer().trim().toLowerCase();
    const f2 = this.fSegundo().trim().toLowerCase();
    const fa = this.fApellidos().trim().toLowerCase();
    const fn = this.fNit().trim();
    const ff = this.fFechaIng().trim(); // yyyy-MM-dd

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

      // Normaliza fechaIngreso
      let ingresoStr = '';
      const anyU: any = u as any;
      if (anyU?.fechaIngreso) {
        try { ingresoStr = new Date(anyU.fechaIngreso).toISOString().slice(0, 10); }
        catch { ingresoStr = ''; }
      }
      const okFecha   = !ff || ingresoStr === ff;

      return hayTerm && hayEstado && hayRol && okPrimer && okSegundo && okApell && okNit && okFecha;
    });
  });

  // Totales y página actual (clamp automático)
  total = computed(() => this.filtered().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  canPrev = computed(() => this.page() > 0);
  canNext = computed(() => this.page() < this.totalPages() - 1);

  paged = computed(() => {
    const list = this.filtered();
    const size = this.pageSize();
    const lastIndex = Math.max(0, this.totalPages() - 1);
    const page = Math.min(this.page(), lastIndex);
    const start = page * size;
    return list.slice(start, start + size);
  });

  // Resetea a la primera página si cambian filtros o datos
  private resetOnFilters = effect(() => {
    const _ = [
      this.rows(),
      this.q(), this.estado(), this.rolId(),
      this.fPrimer(), this.fSegundo(), this.fApellidos(), this.fNit(), this.fFechaIng()
    ];
    this.page.set(0);
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

  // Controles del pager (como en Pedidos)
  prev(){ if (this.canPrev()) this.page.set(this.page() - 1); }
  next(){ if (this.canNext()) this.page.set(this.page() + 1); }

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
