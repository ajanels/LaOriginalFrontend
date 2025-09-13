import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { ProveedoresService, Proveedor } from '../../../services/proveedores.service';

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrls: ['./proveedores.css']
})
export class Proveedores implements OnInit, OnDestroy {
  private svc = inject(ProveedoresService);

  proveedores: Proveedor[] = [];
  proveedoresFiltrados: Proveedor[] = [];

  // Form
  nuevo: Partial<Proveedor> = {
    nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true
  };
  editando: Proveedor | null = null;
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
      next: (data) => { this.proveedores = data ?? []; this.aplicarFiltros(); this.cargando = false; },
      error: () => { this.swalError('No se pudieron cargar los proveedores.'); this.cargando = false; }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevo = { nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarProveedor(p: Proveedor): void {
    this.editando = { ...p };
    this.nuevo = {
      id: p.id,
      nombre: p.nombre,
      nit: p.nit,
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      email: p.email || '',
      direccion: p.direccion || '',
      notas: p.notas || '',
      activo: p.activo
    };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevo = { nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true };
    this.editando = null;
  }

  guardar(): void {
    this.submitted = true;

    if (!this.nuevo?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }
    if (!this.isNitValido(this.nuevo?.nit || '')) {
      this.Toast.fire({ icon: 'warning', title: 'El NIT debe tener exactamente 9 números' });
      return;
    }
    if (!this.isEmailValido(this.nuevo.email)) {
      this.Toast.fire({ icon: 'warning', title: 'Email inválido' });
      return;
    }

    // Normalizaciones
    const nit = (this.nuevo.nit as string); 
    const telefono = (this.nuevo.telefono || '').replace(/\D+/g, '').slice(0, 8) || '';

    const dto: Omit<Proveedor, 'id'> = {
      nombre: this.nuevo.nombre!.trim(),
      nit,
      contacto: this.trimOrNull(this.nuevo.contacto),
      telefono: telefono || null,
      email: this.trimOrNull(this.nuevo.email),
      direccion: this.trimOrNull(this.nuevo.direccion),
      notas: this.trimOrNull(this.nuevo.notas),
      activo: !!this.nuevo.activo
    };

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, dto).subscribe({
        next: () => {
          const i = this.proveedores.findIndex(x => x.id === this.editando!.id);
          if (i > -1) this.proveedores[i] = { ...this.proveedores[i], ...dto } as Proveedor;
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Proveedor actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.swalError(err?.error?.message || 'Ya existe otro proveedor con ese Nombre o NIT.');
          } else if (err?.status === 400) {
            const detalles = this.extractModelStateErrors(err?.error);
            this.swalError(detalles || err?.error?.message || 'Datos inválidos. Revisa NIT/Email.');
          } else if (err?.status === 401 || err?.status === 403) {
            this.swalError('No tienes permisos para editar proveedores.');
          } else {
            this.swalError(err?.error?.message || 'Error al actualizar el proveedor');
          }
          this.cargando = false;
        }
      });
      return;
    }

    this.svc.create(dto).subscribe({
      next: (p) => {
        this.proveedores.unshift(p);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Proveedor creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'Ya existe un proveedor con ese Nombre o NIT.');
        } else if (err?.status === 400) {
          const detalles = this.extractModelStateErrors(err?.error);
          this.swalError(detalles || 'Datos inválidos.');
        } else {
          this.swalError('Error al guardar el proveedor');
        }
        this.cargando = false;
      }
    });
  }

  async eliminarProveedor(): Promise<void> {
    if (!this.editando) return;
    const res = await Swal.fire({
      title: '¿Eliminar proveedor?',
      text: `Se eliminará permanentemente "${this.editando.nombre}".`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!res.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.proveedores = this.proveedores.filter(x => x.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Eliminado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para eliminar este proveedor.');
        } else {
          this.swalError('No se pudo eliminar');
        }
        this.cargando = false;
      }
    });
  }

  // ===== Estado =====
  async confirmarToggle(p: Proveedor): Promise<void> {
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

  cambiarEstado(p: Proveedor): void {
    this.cargandoFila[p.id] = true;
    const previo = p.activo;
    p.activo = !p.activo; 

    this.svc.toggleActivo(p.id, p.activo).subscribe({
      next: (resp) => {
        p.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Proveedor ${resp.activo ? 'activado' : 'desactivado'}` });
        this.cargandoFila[p.id] = false;
      },
      error: (err) => {
        p.activo = previo;
        if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para cambiar el estado.');
        } else {
          this.swalError('No se pudo cambiar el estado');
        }
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
    if (term) {
      list = list.filter(p =>
        (p.nombre || '').toLowerCase().includes(term) ||
        (p.nit || '').toLowerCase().includes(term)
      );
    }
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      list = list.filter(p => p.activo === activo);
    }
    this.proveedoresFiltrados = list;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.proveedoresFiltrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // ===== Validaciones / Utils =====
  onNitInput(): void {
    const digits = (this.nuevo.nit || '').replace(/\D+/g, '').slice(0, 9);
    this.nuevo.nit = digits;
  }
  isNitValido(n?: string | null): boolean { return /^\d{9}$/.test(n ?? ''); }

  onTelefonoInput(): void {
    const onlyDigits = (this.nuevo.telefono || '').replace(/\D+/g, '').slice(0, 8);
    this.nuevo.telefono = onlyDigits;
  }

  private isEmailValido(v?: string | null): boolean {
    if (!v) return true; 
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  private trimOrNull(v?: string | null): string | null {
    const t = (v ?? '').trim();
    return t ? t : null;
  }

  private extractModelStateErrors(errBody: any): string | null {
    const errors = errBody?.errors;
    if (!errors) return null;
    const msgs: string[] = [];
    Object.keys(errors).forEach(k => (errors[k] as string[]).forEach(m => msgs.push(m)));
    return msgs.length ? msgs.join(' ') : null;
  }

  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
