import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { MarcasService, Marca } from '../../../services/marcas.service';

@Component({
  selector: 'app-marcas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './marcas.html',
  styleUrls: ['./marcas.css']
})
export class Marcas implements OnInit, OnDestroy {
  private svc = inject(MarcasService);

  marcas: Marca[] = [];
  marcasFiltradas: Marca[] = [];

  // Form
  nueva: Partial<Marca> = { nombre: '', descripcion: '', activo: true };
  editando: Marca | null = null;
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

  // Toast
  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true
  });

  ngOnInit(): void { this.cargar(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape') onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargar(): void {
    this.cargando = true;
    this.svc.list(false).subscribe({
      next: (data) => { this.marcas = data ?? []; this.aplicarFiltros(); this.cargando = false; },
      error: () => { this.swalError('No se pudieron cargar las marcas.'); this.cargando = false; }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nueva = { nombre: '', descripcion: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarMarca(m: Marca): void {
    this.editando = { ...m };
    this.nueva = { id: m.id, nombre: m.nombre, descripcion: m.descripcion || '', activo: m.activo };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nueva = { nombre: '', descripcion: '', activo: true };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;
    if (!this.nueva?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }

    const dto: Omit<Marca, 'id'> = {
      nombre: this.nueva.nombre!.trim(),
      descripcion: (this.nueva.descripcion || '').trim() || null,
      activo: !!this.nueva.activo
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.marcas.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.marcas[i] = { ...this.marcas[i], ...dto } as Marca;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Marca actualizada' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe otra marca con ese nombre.');
          else if (err?.status === 400) this.swalError('Solicitud inválida (Id del body debe coincidir).');
          else this.swalError('Error al actualizar la marca');
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create(dto).subscribe({
      next: (m) => {
        this.marcas.unshift(m);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Marca creada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe una marca con ese nombre.');
        else this.swalError('Error al guardar la marca');
        this.cargando = false;
      }
    });
  }

  async eliminarMarca(): Promise<void> {
    if (!this.editando) return;
    const res = await Swal.fire({
      title: '¿Eliminar marca?',
      text: `Se eliminará permanentemente "${this.editando.nombre}".`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.marcas = this.marcas.filter(x => x.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Eliminada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: () => { this.swalError('No se pudo eliminar'); this.cargando = false; }
    });
  }

  // ===== Estado =====
  async confirmarToggle(m: Marca): Promise<void> {
    const activar = !m.activo;
    const res = await Swal.fire({
      title: activar ? '¿Activar marca?' : '¿Desactivar marca?',
      text: `"${m.nombre}" cambiará de estado.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;
    this.cambiarEstado(m);
  }

  cambiarEstado(m: Marca): void {
    this.cargandoFila[m.id] = true;
    const previo = m.activo;
    m.activo = !m.activo; 

    this.svc.toggleActivo(m.id, m.activo).subscribe({
      next: (resp) => {
        m.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Marca ${resp.activo ? 'activada' : 'desactivada'}` });
        this.cargandoFila[m.id] = false;
      },
      error: () => {
        m.activo = previo;
        this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[m.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.marcas];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) list = list.filter(m => (m.nombre || '').toLowerCase().includes(term));
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(m => m.activo === activo);
    }
    this.marcasFiltradas = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.marcasFiltradas.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // Utils
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
