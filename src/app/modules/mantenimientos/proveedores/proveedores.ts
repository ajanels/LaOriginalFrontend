import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { ProveedoresService, ProveedorItem } from '../../../services/proveedores.service';

@Component({
  selector: 'app-mant-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrls: ['./proveedores.css'],
})
export class MantProveedoresComponent implements OnInit, OnDestroy {
  private svc = inject(ProveedoresService);

  // Data
  proveedores: ProveedorItem[] = [];
  filtrados: ProveedorItem[] = [];

  // Formulario (simple y compatible con cualquier backend)
  nuevo: Partial<ProveedorItem> = {
    nombre: '', activo: true
  };
  editando: ProveedorItem | null = null;
  submitted = false;

  // UI
  cargando = false;
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // Filtros / paginación
  searchTerm = '';
  filtroEstado = '';
  itemsPorPagina = 10;
  paginaActual = 0;
  inicio = 0;
  fin = 10;
  totalPaginas = 1;
  private searchTimer: any;

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2300, timerProgressBar: true
  });

  ngOnInit(): void { this.cargar(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape') onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Cargar =====
  cargar(): void {
    this.cargando = true;
    this.svc.list(false).subscribe({
      next: (rows: ProveedorItem[]) => { this.proveedores = rows ?? []; this.aplicarFiltros(); this.cargando = false; },
      error: () => { this.swalError('No se pudieron cargar los proveedores.'); this.cargando = false; }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { nombre: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarProveedor(p: ProveedorItem): void {
    this.editando = { ...p };
    this.nuevo = { id: p.id, nombre: p.nombre, activo: p.activo };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { nombre: '', activo: true };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;
    if (!this.nuevo?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }

    const dto = {
      nombre: this.nuevo.nombre!.trim(),
      activo: !!this.nuevo.activo
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.proveedores.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.proveedores[i] = { ...this.proveedores[i], ...dto } as ProveedorItem;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Proveedor actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe otro proveedor con ese nombre.');
          else if (err?.status === 400) this.swalError('Solicitud inválida (Id del body debe coincidir).');
          else this.swalError('Error al actualizar el proveedor');
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create(dto).subscribe({
      next: (p: ProveedorItem) => {
        this.proveedores.unshift(p);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Proveedor creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe un proveedor con ese nombre.');
        else this.swalError('Error al guardar el proveedor');
        this.cargando = false;
      }
    });
  }

  // ===== Eliminar =====
  async eliminarProveedor(p: ProveedorItem): Promise<void> {
    const res = await Swal.fire({
      title: '¿Eliminar proveedor?',
      text: `Se eliminará permanentemente "${p.nombre}".`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(p.id).subscribe({
      next: () => {
        this.proveedores = this.proveedores.filter(x => x.id !== p.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Eliminado' });
        this.cargando = false;
      },
      error: () => { this.swalError('No se pudo eliminar'); this.cargando = false; }
    });
  }

  // ===== Estado (toggle) =====
  async confirmarToggle(p: ProveedorItem): Promise<void> {
    const activar = !p.activo;
    const res = await Swal.fire({
      title: activar ? '¿Activar proveedor?' : '¿Desactivar proveedor?',
      text: `"${p.nombre}" cambiará de estado.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;
    this.cambiarEstado(p);
  }

  cambiarEstado(p: ProveedorItem): void {
    this.cargandoFila[p.id] = true;
    const previo = p.activo;
    p.activo = !p.activo;

    this.svc.toggleActivo(p.id, p.activo).subscribe({
      next: (resp) => {
        p.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Proveedor ${resp.activo ? 'activado' : 'desactivado'}` });
        this.cargandoFila[p.id] = false;
      },
      error: () => {
        p.activo = previo;
        this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[p.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.proveedores];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) list = list.filter(p => (p.nombre || '').toLowerCase().includes(term));
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(p => p.activo === activo);
    }
    this.filtrados = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.filtrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // Utils
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
