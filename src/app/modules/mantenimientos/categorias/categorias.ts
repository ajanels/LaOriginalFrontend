import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { CategoriasService, Categoria } from '../../../services/categorias.service';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categorias.html',
  styleUrls: ['./categorias.css']
})
export class Categorias implements OnInit, OnDestroy {
  private svc = inject(CategoriasService);

  // ===== Data =====
  categorias: Categoria[] = [];
  categoriasFiltradas: Categoria[] = [];

  // ===== Form =====
  nuevaCategoria: Partial<Categoria> = { nombre: '', descripcion: '', activo: true };
  editando: Categoria | null = null;
  submitted = false;

  // ===== UI =====
  cargando = false;
  mensaje = '';
  errorMsg = '';
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // ===== Filtros / Paginación =====
  searchTerm = '';
  readonly itemsPorPagina = 9; // <-- fijo a 9
  paginaActual = 0;
  inicio = 0;
  fin = this.itemsPorPagina;
  totalPaginas = 1;
  private searchTimer: any;

  // Vista por estado (segmentado)
  view: 'activos' | 'inactivos' | 'todos' = 'activos';
  get activosCount(): number   { return this.categorias.filter(c =>  c.activo).length; }
  get inactivosCount(): number { return this.categorias.filter(c => !c.activo).length; }

  // Toast
  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true
  });

  ngOnInit(): void { this.cargarCategorias(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  // Cerrar modal con ESC
  @HostListener('document:keydown.escape')
  onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargarCategorias(): void {
    this.cargando = true;
    this.errorMsg = '';
    this.svc.list(false).subscribe({
      next: (data) => {
        this.categorias = data ?? [];
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar las categorías.');
        this.cargando = false;
      }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevaCategoria = { nombre: '', descripcion: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarCategoria(cat: Categoria): void {
    this.editando = { ...cat };
    this.nuevaCategoria = { id: cat.id, nombre: cat.nombre, descripcion: cat.descripcion, activo: cat.activo };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevaCategoria = { nombre: '', descripcion: '', activo: true };
    this.editando = null;
  }

  guardarCategoria(): void {
    this.submitted = true;
    if (!this.nuevaCategoria?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }
    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, {
        id: this.editando.id,
        nombre: this.nuevaCategoria.nombre!.trim(),
        descripcion: this.nuevaCategoria.descripcion?.trim() || '',
        activo: this.editando.activo
      } as any).subscribe({
        next: () => {
          const idx = this.categorias.findIndex(c => c.id === this.editando!.id);
          if (idx > -1) {
            this.categorias[idx] = {
              ...this.categorias[idx],
              nombre: this.nuevaCategoria.nombre!.trim(),
              descripcion: this.nuevaCategoria.descripcion?.trim() || ''
            };
          }
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Categoría actualizada' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.swalError(err?.error?.message || 'Ya existe otra categoría con ese nombre.');
          } else if (err?.status === 400) {
            this.swalError('Solicitud inválida (Id del body debe coincidir).');
          } else {
            this.swalError('Error al actualizar la categoría');
          }
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create({
      nombre: this.nuevaCategoria.nombre!.trim(),
      descripcion: this.nuevaCategoria.descripcion?.trim() || '',
      activo: true
    }).subscribe({
      next: (cat) => {
        this.categorias.unshift(cat);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Categoría creada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'Ya existe una categoría con ese nombre.');
        } else {
          this.swalError('Error al guardar la categoría');
        }
        this.cargando = false;
      }
    });
  }

  async eliminarCategoria(): Promise<void> {
    if (!this.editando) return;

    const result = await Swal.fire({
      title: '¿Eliminar categoría?',
      text: `Se eliminará permanentemente "${this.editando.nombre}".`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.categorias = this.categorias.filter(c => c.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Categoría eliminada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para eliminar esta categoría.');
        } else {
          this.swalError('No se pudo eliminar la categoría');
        }
        this.cargando = false;
      }
    });
  }

  // ===== Estado (lista) =====
  async confirmarToggle(cat: Categoria): Promise<void> {
    const activar = !cat.activo;
    const result = await Swal.fire({
      title: activar ? '¿Activar categoría?' : '¿Desactivar categoría?',
      text: `"${cat.nombre}" cambiará de estado.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    this.cambiarEstado(cat);
  }

  cambiarEstado(cat: Categoria): void {
    this.cargandoFila[cat.id] = true;
    const previo = cat.activo;
    cat.activo = !cat.activo; // optimista

    this.svc.toggleActivo(cat.id, cat.activo).subscribe({
      next: (resp) => {
        cat.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Categoría ${resp.activo ? 'activada' : 'desactivada'}` });
        this.cargandoFila[cat.id] = false;
        this.aplicarFiltros();
      },
      error: () => {
        cat.activo = previo;
        this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[cat.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  setView(v: 'activos'|'inactivos'|'todos'): void {
    if (this.view !== v) {
      this.view = v;
      this.paginaActual = 0;
      this.aplicarFiltros();
    }
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let filtradas = [...this.categorias];

    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) filtradas = filtradas.filter(c => (c.nombre || '').toLowerCase().includes(term));

    if (this.view === 'activos')       filtradas = filtradas.filter(c =>  c.activo);
    else if (this.view === 'inactivos') filtradas = filtradas.filter(c => !c.activo);

    this.categoriasFiltradas = filtradas;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.categoriasFiltradas.length / this.itemsPorPagina));
  }

  paginaAnterior(): void {
    if (this.paginaActual > 0) {
      this.paginaActual--;
      this.actualizarPaginacion();
    }
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas - 1) {
      this.paginaActual++;
      this.actualizarPaginacion();
    }
  }

  // ===== Utils =====
  private swalError(text: string): void {
    Swal.fire({ icon: 'error', title: 'Ups…', text });
  }
}
