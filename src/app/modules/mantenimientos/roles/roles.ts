import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { RolesService, Rol } from '../../../services/roles.service';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roles.html',
  styleUrls: ['./roles.css']
})
export class Roles implements OnInit, OnDestroy {
  private svc = inject(RolesService);

  roles: Rol[] = [];
  rolesFiltrados: Rol[] = [];

  // Form
  nuevo: Partial<Rol> = { nombre: '', descripcion: '', activo: true };
  editando: Rol | null = null;
  submitted = false;

  // UI
  cargando = false;
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // Filtros / paginación
  searchTerm = '';
  filtroEstado = '';
  itemsPorPagina = 5;
  paginaActual = 0;
  inicio = 0;
  fin = 5;
  totalPaginas = 1;
  private searchTimer: any;

  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true
  });

  ngOnInit(): void { this.cargar(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }
  @HostListener('document:keydown.escape') onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargar(): void {
    this.cargando = true;
    this.svc.list(false).subscribe({
      next: (data) => {
        this.roles = data ?? [];
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar los roles.');
        this.cargando = false;
      }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { nombre: '', descripcion: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarRol(r: Rol): void {
    this.editando = { ...r };
    this.nuevo = { id: r.id, nombre: r.nombre, descripcion: r.descripcion || '', activo: r.activo };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { nombre: '', descripcion: '', activo: true };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;

    // Validaciones de UI (backend: 3..50)
    const nombre = (this.nuevo.nombre || '').trim();
    if (nombre.length < 3 || nombre.length > 50) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre debe tener entre 3 y 50 caracteres' });
      return;
    }

    const dto = {
      nombre,
      descripcion: (this.nuevo.descripcion || '').trim() || null,
      activo: !!this.nuevo.activo
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.roles.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.roles[i] = { ...this.roles[i], ...dto } as Rol;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Rol actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.swalError(err?.error?.message || 'Ya existe otro rol con ese nombre.');
          } else if (err?.status === 401 || err?.status === 403) {
            this.swalError('No tienes permisos para editar roles.');
          } else if (err?.status === 400) {
            this.swalError('Solicitud inválida (Id del body debe coincidir).');
          } else {
            this.swalError('Error al actualizar el rol.');
          }
          this.cargando = false;
        }
      });
      return;
    }

    this.svc.create(dto).subscribe({
      next: (r) => {
        this.roles.unshift(r);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Rol creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'Ya existe un rol con ese nombre.');
        } else if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para crear roles.');
        } else {
          this.swalError('Error al guardar el rol.');
        }
        this.cargando = false;
      }
    });
  }

  async eliminarRol(): Promise<void> {
    if (!this.editando) return;

    const res = await Swal.fire({
      title: '¿Eliminar rol?',
      text: 'Si hay usuarios con este rol no se podrá eliminar.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.roles = this.roles.filter(x => x.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Rol eliminado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'No se puede eliminar: hay usuarios asociados.');
        } else if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para eliminar roles.');
        } else {
          this.swalError('No se pudo eliminar el rol.');
        }
        this.cargando = false;
      }
    });
  }

  // ===== Estado =====
  async confirmarToggle(r: Rol): Promise<void> {
    const activar = !r.activo;
    const res = await Swal.fire({
      title: activar ? '¿Activar rol?' : '¿Desactivar rol?',
      text: `"${r.nombre}" cambiará de estado.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;
    this.cambiarEstado(r);
  }

  cambiarEstado(r: Rol): void {
    this.cargandoFila[r.id] = true;
    const previo = r.activo;
    r.activo = !r.activo;

    this.svc.toggleActivo(r.id, r.activo).subscribe({
      next: (resp) => {
        r.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Rol ${resp.activo ? 'activado' : 'desactivado'}` });
        this.cargandoFila[r.id] = false;
      },
      error: (err) => {
        r.activo = previo;
        if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para cambiar el estado.');
        } else {
          this.swalError('No se pudo cambiar el estado.');
        }
        this.cargandoFila[r.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.roles];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) list = list.filter(r => (r.nombre || '').toLowerCase().includes(term));
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(r => r.activo === activo);
    }
    this.rolesFiltrados = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.rolesFiltrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // ===== Utils =====
  private swalError(text: string): void {
    Swal.fire({ icon: 'error', title: 'Ups…', text });
  }
}
