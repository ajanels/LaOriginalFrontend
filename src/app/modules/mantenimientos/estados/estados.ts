import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { EstadosService, EstadoItem, EstadoUpsertDto } from '../../../services/estados.service';

@Component({
  selector: 'app-estados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estados.html',
  styleUrls: ['./estados.css']
})
export class Estados implements OnInit, OnDestroy {
  private svc = inject(EstadosService);

  // Data
  estados: EstadoItem[] = [];
  estadosFiltrados: EstadoItem[] = [];

  // Form
  nuevo: Partial<EstadoUpsertDto> = { tipo: '', nombre: '', activo: true, notas: '' };
  editando: EstadoItem | null = null;
  submitted = false;

  // UI
  cargando = false;
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // Filtros/paginación
  searchTerm = '';
  filtroTipo = '';     
  filtroEstado = '';   
  tiposDisponibles: string[] = []; 
  itemsPorPagina = 5;
  paginaActual = 0;
  inicio = 0;
  fin = 5;
  totalPaginas = 1;
  private searchTimer: any;

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true
  });

  ngOnInit(): void { this.cargar(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape') onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  cargar(): void {
    this.cargando = true;
    // Podrías pasar this.filtroTipo para que el backend ya filtre por tipo.
    this.svc.list().subscribe({
      next: (data) => {
        this.estados = data ?? [];
        this.tiposDisponibles = Array.from(new Set(this.estados.map(e => e.tipo))).sort();
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar los estados.');
        this.cargando = false;
      }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { tipo: '', nombre: '', activo: true, notas: '' };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarEstado(e: EstadoItem): void {
    this.editando = { ...e };
    // Obtener notas actuales desde el backend (GET by id)
    this.svc.getById(e.id).subscribe({
      next: (det) => {
        this.nuevo = { tipo: det.tipo, nombre: det.nombre, activo: det.activo, notas: det.notas || '' };
        this.submitted = false;
        this.mostrarModal = true;
      },
      error: () => {
        // Si falla, al menos abrimos con datos básicos de la fila
        this.nuevo = { tipo: e.tipo, nombre: e.nombre, activo: e.activo, notas: '' };
        this.submitted = false;
        this.mostrarModal = true;
      }
    });
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { tipo: '', nombre: '', activo: true, notas: '' };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;
    if (!this.nuevo?.tipo?.trim() || !this.nuevo?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'Tipo y Nombre son requeridos' });
      return;
    }
    const dto: EstadoUpsertDto = {
      tipo: this.nuevo.tipo!.trim(),
      nombre: this.nuevo.nombre!.trim(),
      activo: !!this.nuevo.activo,
      notas: (this.nuevo.notas || '').trim() || null
    };

    this.cargando = true;
    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const idx = this.estados.findIndex(x => x.id === this.editando!.id);
          if (idx > -1) this.estados[idx] = { ...this.estados[idx], ...dto } as EstadoItem;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Estado actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) this.swalError(err?.error || 'Ya existe otro estado con ese Tipo y Nombre.');
          else this.swalError('Error al actualizar el estado');
          this.cargando = false;
        }
      });
      return;
    }

    this.svc.create(dto).subscribe({
      next: (res) => {
        const nuevoItem: EstadoItem = { id: (res as any)?.id ?? 0, tipo: dto.tipo, nombre: dto.nombre, activo: dto.activo };
        this.estados.unshift(nuevoItem);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Estado creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error || 'Ya existe un estado con ese Tipo y Nombre.');
        else this.swalError('Error al guardar el estado');
        this.cargando = false;
      }
    });
  }

  async eliminarEstado(e: EstadoItem): Promise<void> {
    const result = await Swal.fire({
      title: '¿Eliminar estado?',
      text: `Se eliminará permanentemente "${e.tipo} / ${e.nombre}".`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!result.isConfirmed) return;

    this.cargandoFila[e.id] = true;
    this.svc.delete(e.id).subscribe({
      next: () => {
        this.estados = this.estados.filter(x => x.id !== e.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Estado eliminado' });
        this.cargandoFila[e.id] = false;
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error || 'No se puede eliminar: está referenciado.');
        else this.swalError('No se pudo eliminar el estado');
        this.cargandoFila[e.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.estados];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) list = list.filter(e => e.nombre.toLowerCase().includes(term) || e.tipo.toLowerCase().includes(term));
    if (this.filtroTipo) list = list.filter(e => e.tipo === this.filtroTipo);
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(e => e.activo === activo);
    }
    this.estadosFiltrados = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.estadosFiltrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // Utils
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
