import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColoresService, ColorItem } from '../../../services/colores.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-colores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './colores.html',
  styleUrls: ['./colores.css']
})
export class Colores implements OnInit, OnDestroy {
  private svc = inject(ColoresService);

  colores: ColorItem[] = [];
  coloresFiltrados: ColorItem[] = [];

  // Form
  nuevoColor: Partial<ColorItem> = { nombre: '', hex: '', notas: '', activo: true };
  editando: ColorItem | null = null;
  submitted = false;

  // UI
  cargando = false;
  mensaje = '';
  errorMsg = '';
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

  // ====== Mapeo nombre → HEX (esp) ======
  private nombreAHex: Record<string, string> = {
    'rojo':'#FF3B30', 'azul':'#007BFF', 'verde':'#28A745', 'amarillo':'#FFC107',
    'morado':'#6F42C1', 'violeta':'#8A2BE2', 'naranja':'#FD7E14', 'rosa':'#E83E8C',
    'negro':'#000000', 'blanco':'#FFFFFF', 'gris':'#6C757D', 'café':'#8B4513',
    'cafe':'#8B4513', 'marron':'#8B4513', 'marrón':'#8B4513', 'celeste':'#00BFFF',
    'turquesa':'#40E0D0', 'dorado':'#FFD700', 'plateado':'#C0C0C0', 'beige':'#F5F5DC'
  };

  ngOnInit(): void { this.cargarColores(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargarColores(): void {
    this.cargando = true;
    this.errorMsg = '';
    this.svc.list(false).subscribe({
      next: (data) => {
        this.colores = data ?? [];
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar los colores.');
        this.cargando = false;
      }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevoColor = { nombre: '', hex: '', notas: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarColor(c: ColorItem): void {
    this.editando = { ...c };
    this.nuevoColor = {
      id: c.id, nombre: c.nombre, hex: c.hex || '', notas: c.notas || '', activo: c.activo
    };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevoColor = { nombre: '', hex: '', notas: '', activo: true };
    this.editando = null;
  }

  // ===== Validaciones / Sanitizado =====
  hexValidoValor(v: string): boolean { return /^#([A-Fa-f0-9]{6})$/.test(v); }
  hexValido(): boolean {
    const v = (this.nuevoColor.hex || '').trim();
    return v.length === 0 || this.hexValidoValor(v);
  }

  sanitizarHex(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    let v = (input.value || '').toUpperCase().replace(/[^#A-F0-9]/g, '');
    if (v && v[0] !== '#') v = '#' + v;
    v = v.slice(0, 7);
    input.value = v;
    this.nuevoColor.hex = v;
  }
  onColorPickerChange(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    this.nuevoColor.hex = (input.value || '').toUpperCase();
  }

  // ===== Color de muestra: HEX válido o deducido del nombre =====
  colorFromName(nombre?: string): string | null {
    if (!nombre) return null;
    const key = nombre.trim().toLowerCase();
    return this.nombreAHex[key] || null;
  }
  resolveColor(c: ColorItem): string {
    const hex = (c.hex || '').trim();
    if (hex && this.hexValidoValor(hex)) return hex.toUpperCase();
    return this.colorFromName(c.nombre) || '#ccc';
  }

  guardarColor(): void {
    this.submitted = true;
    if (!this.nuevoColor?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }
    if (!this.hexValido()) {
      this.Toast.fire({ icon: 'warning', title: 'El color debe ser #RRGGBB' });
      return;
    }
    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, {
        id: this.editando.id,
        nombre: this.nuevoColor.nombre!.trim(),
        hex: (this.nuevoColor.hex || '').trim() || null,
        notas: this.nuevoColor.notas?.trim() || null,
        activo: this.editando.activo
      } as any).subscribe({
        next: () => {
          const idx = this.colores.findIndex(x => x.id === this.editando!.id);
          if (idx > -1) {
            this.colores[idx] = {
              ...this.colores[idx],
              nombre: this.nuevoColor.nombre!.trim(),
              hex: (this.nuevoColor.hex || '').trim() || null,
              notas: this.nuevoColor.notas?.trim() || null
            } as ColorItem;
          }
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Color actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.swalError(err?.error?.message || 'Ya existe otro color con ese nombre.');
          } else if (err?.status === 400) {
            this.swalError('Solicitud inválida (Id del body debe coincidir).');
          } else {
            this.swalError('Error al actualizar el color');
          }
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create({
      nombre: this.nuevoColor.nombre!.trim(),
      hex: (this.nuevoColor.hex || '').trim() || null,
      notas: this.nuevoColor.notas?.trim() || null,
      activo: true
    }).subscribe({
      next: (c) => {
        this.colores.unshift(c);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Color creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'Ya existe un color con ese nombre.');
        } else {
          this.swalError('Error al guardar el color');
        }
        this.cargando = false;
      }
    });
  }

  async eliminarColor(): Promise<void> {
    if (!this.editando) return;
    const result = await Swal.fire({
      title: '¿Eliminar color?', text: `Se eliminará permanentemente "${this.editando.nombre}".`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });
    if (!result.isConfirmed) return;

    this.cargando = true;
    this.svc.delete(this.editando.id).subscribe({
      next: () => {
        this.colores = this.colores.filter(x => x.id !== this.editando!.id);
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Color eliminado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: () => {
        this.swalError('No se pudo eliminar el color');
        this.cargando = false;
      }
    });
  }

  // ===== Estado =====
  async confirmarToggle(c: ColorItem): Promise<void> {
    const activar = !c.activo;
    const result = await Swal.fire({
      title: activar ? '¿Activar color?' : '¿Desactivar color?',
      text: `"${c.nombre}" cambiará de estado.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar', cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    this.cambiarEstado(c);
  }
  cambiarEstado(c: ColorItem): void {
    this.cargandoFila[c.id] = true;
    const previo = c.activo;
    c.activo = !c.activo;
    this.svc.toggleActivo(c.id, c.activo).subscribe({
      next: (resp) => {
        c.activo = resp.activo;
        this.Toast.fire({ icon: 'success', title: `Color ${resp.activo ? 'activado' : 'desactivado'}` });
        this.cargandoFila[c.id] = false;
      },
      error: () => {
        c.activo = previo;
        this.swalError('No se pudo cambiar el estado');
        this.cargandoFila[c.id] = false;
      }
    });
  }

  // ===== Filtros / Paginación =====
  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }
  aplicarFiltros(): void {
    let filtrados = [...this.colores];
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) {
      filtrados = filtrados.filter(c =>
        (c.nombre || '').toLowerCase().includes(term) ||
        (c.hex || '').toLowerCase().includes(term)
      );
    }
    if (this.filtroEstado) {
      const activo = this.filtroEstado === 'true';
      filtrados = filtrados.filter(c => c.activo === activo);
    }
    this.coloresFiltrados = filtrados;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }
  cambiarPaginacion(): void { this.paginaActual = 0; this.actualizarPaginacion(); }
  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.coloresFiltrados.length / this.itemsPorPagina));
  }
  paginaAnterior(): void { if (this.paginaActual > 0) { this.paginaActual--; this.actualizarPaginacion(); } }
  paginaSiguiente(): void { if (this.paginaActual < this.totalPaginas - 1) { this.paginaActual++; this.actualizarPaginacion(); } }

  // Utils
  private swalError(text: string): void { Swal.fire({ icon: 'error', title: 'Ups…', text }); }
}
