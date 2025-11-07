import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { UnidadesMedidaService, UnidadMedida } from '../../../services/unidades-medida.service';

@Component({
  selector: 'app-unidades-medida',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './unidades-medida.html',
  styleUrls: ['./unidades-medida.css']
})
export class UnidadesMedida implements OnInit, OnDestroy {
  private svc = inject(UnidadesMedidaService);

  // Data
  unidades: UnidadMedida[] = [];
  unidadesFiltradas: UnidadMedida[] = [];

  // Form
  nuevo: Partial<UnidadMedida> = { nombre: '', simbolo: '', descripcion: '', activo: true };
  editando: UnidadMedida | null = null;
  submitted = false;

  // UI
  cargando = false;
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // Filtros / paginación
  searchTerm = '';
  view: 'activos' | 'inactivos' | 'todos' = 'activos';
  itemsPorPagina = 5;
  paginaActual = 0;
  inicio = 0;
  fin = 5;
  totalPaginas = 1;
  private searchTimer: any;

  get activosCount(): number   { return this.unidades.filter(u =>  u.activo).length; }
  get inactivosCount(): number { return this.unidades.filter(u => !u.activo).length; }

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
      next: (data) => { this.unidades = data ?? []; this.aplicarFiltros(); this.cargando = false; },
      error: () => { this.swalError('No se pudieron cargar las unidades.'); this.cargando = false; }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { nombre: '', simbolo: '', descripcion: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarUnidad(u: UnidadMedida): void {
    this.editando = { ...u };
    this.nuevo = { id: u.id, nombre: u.nombre, simbolo: u.simbolo, descripcion: u.descripcion || '', activo: u.activo };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { nombre: '', simbolo: '', descripcion: '', activo: true };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;

    if (!this.nuevo?.nombre?.trim()) { this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' }); return; }
    if (!this.nuevo?.simbolo?.trim()) { this.Toast.fire({ icon: 'warning', title: 'El símbolo es requerido' }); return; }

    const nombre  = this.nuevo.nombre!.trim();
    const simbolo = this.normalizeSimbolo(this.nuevo.simbolo!);
    const dto: Omit<UnidadMedida, 'id'> = {
      nombre, simbolo,
      descripcion: (this.nuevo.descripcion || '').trim() || null,
      activo: !!this.nuevo.activo
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.unidades.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.unidades[i] = { ...this.unidades[i], ...dto } as UnidadMedida;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Unidad actualizada' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) this.swalError(err?.error?.message || 'Símbolo duplicado.');
          else if (err?.status === 401 || err?.status === 403) this.swalError('No tienes permisos para editar.');
          else if (err?.status === 400) this.swalError('Solicitud inválida (Id del body debe coincidir).');
          else this.swalError('Error al actualizar la unidad.');
          this.cargando = false;
        }
      });
      return;
    }

    this.svc.create(dto).subscribe({
      next: (u) => {
        this.unidades.unshift(u);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Unidad creada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error?.message || 'Símbolo duplicado.');
        else this.swalError('Error al guardar la unidad.');
        this.cargando = false;
      }
    });
  }

  // ===== Eliminar =====
  async eliminarUnidad(): Promise<void> {
    if (!this.editando) return;
    const res = await Swal.fire({
      title: '¿Eliminar unidad?',
      text: `Se eliminará permanentemente "${this.editando.nombre}".`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.unidades = this.unidades.filter(x => x.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Eliminado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 401 || err?.status === 403) this.swalError('No tienes permisos para eliminar.');
        else this.swalError('No se pudo eliminar.');
        this.cargando = false;
      }
    });
  }

  // ===== Estado =====
  async confirmarToggle(u: UnidadMedida): Promise<void> {
    const activar = !u.activo;
    const res = await Swal.fire({
      title: activar ? '¿Activar unidad?' : '¿Desactivar unidad?',
      text: `"${u.nombre}" cambiará de estado.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;
    this.cambiarEstado(u);
  }

  cambiarEstado(u: UnidadMedida): void {
    this.cargandoFila[u.id] = true;
    const previo = u.activo;
    u.activo = !u.activo;

    this.svc.toggleActivo(u.id, u.activo).subscribe({
      next: (resp) => {
        u.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Unidad ${resp.activo ? 'activada' : 'desactivada'}` });
        this.cargandoFila[u.id] = false;
        this.aplicarFiltros();
      },
      error: (err) => {
        u.activo = previo;
        if (err?.status === 401 || err?.status === 403) this.swalError('No tienes permisos para cambiar el estado.');
        else this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[u.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  setView(v: 'activos' | 'inactivos' | 'todos'){ if(this.view!==v){ this.view=v; this.paginaActual=0; this.aplicarFiltros(); } }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.unidades];
    const term = (this.searchTerm || '').trim().toLowerCase();

    if (term) {
      list = list.filter(u =>
        (u.nombre  || '').toLowerCase().includes(term) ||
        (u.simbolo || '').toLowerCase().includes(term)
      );
    }

    if (this.view === 'activos')       list = list.filter(u =>  u.activo);
    else if (this.view === 'inactivos') list = list.filter(u => !u.activo);

    this.unidadesFiltradas = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.unidadesFiltradas.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // ===== Utils =====
  onSimboloInput(): void {
    let s = (this.nuevo.simbolo || '').toUpperCase();
    s = s.replace(/[^A-Z0-9%/.\-]/g, '').slice(0, 8);
    this.nuevo.simbolo = s;
  }
  private normalizeSimbolo(v: string): string {
    return (v || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9%/.\-]/g, '').slice(0, 8);
  }
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
