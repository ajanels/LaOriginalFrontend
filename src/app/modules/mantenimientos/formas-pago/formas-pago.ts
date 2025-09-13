import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { FormasPagoService, FormaPagoItem } from '../../../services/formas-pago.service';

@Component({
  selector: 'app-formas-pago',
  imports: [CommonModule,FormsModule],
  templateUrl: './formas-pago.html',
  styleUrl: './formas-pago.css'
})

export class FormasPago implements OnInit, OnDestroy {
  private svc = inject(FormasPagoService);

  // Data
  formas: FormaPagoItem[] = [];
  formasFiltradas: FormaPagoItem[] = [];

  // Form
  nuevo: Partial<FormaPagoItem> = {
    nombre: '', descripcion: '', activo: true, requiereReferencia: false, esCredito: false
  };
  editando: FormaPagoItem | null = null;
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
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true
  });

  ngOnInit(): void { this.cargar(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape') onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargar(): void {
    this.cargando = true;
    this.svc.list(false).subscribe({
      next: (data) => { this.formas = data ?? []; this.aplicarFiltros(); this.cargando = false; },
      error: () => { this.swalError('No se pudieron cargar las formas de pago.'); this.cargando = false; }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { nombre: '', descripcion: '', activo: true, requiereReferencia: false, esCredito: false };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarForma(f: FormaPagoItem): void {
    this.editando = { ...f };
    this.nuevo = {
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion || '',
      activo: f.activo,
      requiereReferencia: f.requiereReferencia,
      esCredito: f.esCredito
    };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { nombre: '', descripcion: '', activo: true, requiereReferencia: false, esCredito: false };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;
    if (!this.nuevo?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }

    const dto: Omit<FormaPagoItem, 'id'> = {
      nombre: this.nuevo.nombre!.trim(),
      descripcion: (this.nuevo.descripcion || '').trim() || null,
      activo: !!this.nuevo.activo,
      requiereReferencia: !!this.nuevo.requiereReferencia,
      esCredito: !!this.nuevo.esCredito
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.formas.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.formas[i] = { ...this.formas[i], ...dto } as FormaPagoItem;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Forma de pago actualizada' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe otra forma de pago con ese nombre.');
          else if (err?.status === 400) this.swalError('Solicitud inválida (Id del body debe coincidir).');
          else this.swalError('Error al actualizar la forma de pago');
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create(dto).subscribe({
      next: (f) => {
        this.formas.unshift(f);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Forma de pago creada' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) this.swalError(err?.error?.message || 'Ya existe una forma de pago con ese nombre.');
        else this.swalError('Error al guardar la forma de pago');
        this.cargando = false;
      }
    });
  }

  async eliminarForma(f: FormaPagoItem): Promise<void> {
    const res = await Swal.fire({
      title: '¿Eliminar forma de pago?',
      text: `Se eliminará permanentemente "${f.nombre}".`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(f.id).subscribe({
      next: () => {
        this.formas = this.formas.filter(x => x.id !== f.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Eliminado' });
        this.cargando = false;
      },
      error: () => { this.swalError('No se pudo eliminar'); this.cargando = false; }
    });
  }

  // ===== Estado =====
  async confirmarToggle(f: FormaPagoItem): Promise<void> {
    const activar = !f.activo;
    const res = await Swal.fire({
      title: activar ? '¿Activar forma de pago?' : '¿Desactivar forma de pago?',
      text: `"${f.nombre}" cambiará de estado.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;
    this.cambiarEstado(f);
  }

  cambiarEstado(f: FormaPagoItem): void {
    this.cargandoFila[f.id] = true;
    const previo = f.activo;
    f.activo = !f.activo; 

    this.svc.toggleActivo(f.id, f.activo).subscribe({
      next: (resp) => {
        f.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Forma de pago ${resp.activo ? 'activada' : 'desactivada'}` });
        this.cargandoFila[f.id] = false;
      },
      error: () => {
        f.activo = previo;
        this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[f.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let list = [...this.formas];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) list = list.filter(f => (f.nombre || '').toLowerCase().includes(term));
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(f => f.activo === activo);
    }
    this.formasFiltradas = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.formasFiltradas.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // Utils
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
