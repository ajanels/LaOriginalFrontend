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

  // datos
  loading = signal(false);
  rows = signal<Usuario[]>([]);
  roles = signal<Rol[]>([]);

  // filtros
  q = signal<string>('');
  estado = signal<string>('');
  rolId = signal<number | null>(null);

  // modal
  show = signal(false);
  mode = signal<ModalMode>('create');
  current = signal<Usuario | null>(null);

  // paginación
  page = signal<number>(1);
  pageSize = signal<number>(10);

  // filtros combinados
  filtered = computed(() => {
    const term = this.q().trim().toLowerCase();
    const est = this.estado();
    const rid = this.rolId();

    return this.rows().filter(u => {
      const hayTerm = !term || (
        `${u.primerNombre} ${u.segundoNombre ?? ''} ${u.primerApellido} ${u.segundoApellido ?? ''} ${u.username ?? ''} ${u.email}`
          .toLowerCase()
          .includes(term)
      );
      const hayEstado = !est || u.estado === est;
      const hayRol = !rid || (u.rol?.id === rid);
      return hayTerm && hayEstado && hayRol;
    });
  });

  // total de páginas y datos paginados
  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  paged = computed(() => {
    // si cambia filtro, regresa a página 1
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
      error: () => {} // silencioso
    });
  }

  changePageSize(size: number) {
    this.pageSize.set(Number(size));
    this.page.set(1);
  }
  nextPage() { if (this.page() < this.totalPages()) this.page.update(p => p + 1); }
  prevPage() { if (this.page() > 1) this.page.update(p => p - 1); }

  openCreate() {
    this.mode.set('create');
    this.current.set(null);
    this.show.set(true);
  }

  openEdit(u: Usuario) {
    this.mode.set('edit');
    this.loading.set(true);
    this.api.get(u.id).subscribe({
      next: full => { this.current.set(full); this.show.set(true); this.loading.set(false); },
      error: () => { this.loading.set(false); Swal.fire('Error','No se pudo cargar el usuario','error'); }
    });
  }

  openView(u: Usuario) {
    this.mode.set('view');
    this.loading.set(true);
    this.api.get(u.id).subscribe({
      next: full => { this.current.set(full); this.show.set(true); this.loading.set(false); },
      error: () => { this.loading.set(false); Swal.fire('Error','No se pudo cargar el usuario','error'); }
    });
  }

  onClose(refresh: boolean) {
    this.show.set(false);
    this.current.set(null);
    if (refresh) this.reload();
  }

  remove(u: Usuario) {
    Swal.fire({
      icon: 'warning',
      title: '¿Eliminar usuario?',
      text: `${u.primerNombre} ${u.primerApellido}`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (res.isConfirmed) {
        this.api.remove(u.id).subscribe({
          next: () => { Swal.fire('Eliminado','','success'); this.reload(); },
          error: () => Swal.fire('Error','No se pudo eliminar','error')
        });
      }
    });
  }
}
