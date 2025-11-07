import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService, Cliente } from '../../../services/clientes.service';
import Swal from 'sweetalert2';

type EstadoTab = 'activos' | 'inactivos' | 'todos';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrls: ['./clientes.css']
})
export class Clientes implements OnInit, OnDestroy {
  private svc = inject(ClientesService);

  clientes: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];

  // Form
  nuevoCliente: Partial<Cliente> = {
    nombre: '', nit: '', telefono: '', email: '', direccion: '', notas: '', activo: true
  };
  editando: Cliente | null = null;
  submitted = false;

  // UI
  cargando = false;
  mensaje = '';
  errorMsg = '';
  mostrarModal = false;
  cargandoFila: Record<number, boolean> = {};

  // Filtros / paginación
  searchTerm = '';
  estadoTab: EstadoTab = 'activos';     // << segmentado por defecto
  itemsPorPagina = 9;
  paginaActual = 0;
  inicio = 0;
  fin = 9;
  totalPaginas = 1;
  private searchTimer: any;

  // Contadores (sobre la lista completa)
  countActivos = 0;
  countInactivos = 0;
  countTodos = 0;

  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true
  });

  // ===== Ciclo de vida =====
  ngOnInit(): void { this.cargarClientes(); }
  ngOnDestroy(): void { if (this.searchTimer) clearTimeout(this.searchTimer); }

  // ESC cierra modal
  @HostListener('document:keydown.escape')
  onEsc() { if (this.mostrarModal) this.cerrarModal(); }

  // ===== Data =====
  cargarClientes(): void {
    this.cargando = true;
    this.errorMsg = '';
    this.svc.list(false).subscribe({
      next: (data) => {
        this.clientes = data ?? [];
        this.actualizarContadores();
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: () => {
        this.swalError('No se pudieron cargar los clientes.');
        this.cargando = false;
      }
    });
  }

  // ===== Crear / Editar =====
  abrirCrear(): void {
    this.editando = null;
    this.nuevoCliente = { nombre: '', nit: '', telefono: '', email: '', direccion: '', notas: '', activo: true };
    this.submitted = false;
    this.mostrarModal = true;
  }

  editarCliente(c: Cliente): void {
    this.editando = { ...c };
    this.nuevoCliente = {
      id: c.id,
      nombre: c.nombre,
      nit: c.nit || '',
      telefono: c.telefono || '',
      email: c.email || '',
      direccion: c.direccion || '',
      notas: c.notas || '',
      activo: c.activo
    };
    this.submitted = false;
    this.mostrarModal = true;
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.submitted = false;
    this.nuevoCliente = { nombre: '', nit: '', telefono: '', email: '', direccion: '', notas: '', activo: true };
    this.editando = null;
  }

  // ===== Sanitizadores / Validaciones =====
  sanitizarNit(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const soloDigitos = (input.value || '').replace(/\D+/g, '').slice(0, 9);
    input.value = soloDigitos;
    this.nuevoCliente.nit = soloDigitos;
  }

  sanitizarTelefono(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const solo = (input.value || '').replace(/\D+/g, '').slice(0, 8);
    input.value = solo;
    this.nuevoCliente.telefono = solo;
  }

  nitValido(): boolean {
    const nit = (this.nuevoCliente.nit || '').trim();
    return nit.length === 0 || /^[0-9]{9}$/.test(nit);
  }

  guardarCliente(): void {
    this.submitted = true;

    if (!this.nuevoCliente?.nombre?.trim()) {
      this.Toast.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }
    if (!this.nitValido()) {
      this.Toast.fire({ icon: 'warning', title: 'NIT debe tener 9 dígitos numéricos' });
      return;
    }

    this.cargando = true;

    if (this.editando) {
      this.svc.update(this.editando.id, {
        id: this.editando.id,
        nombre: this.nuevoCliente.nombre!.trim(),
        nit: this.nuevoCliente.nit?.trim() || null,
        telefono: this.nuevoCliente.telefono?.trim() || null,
        email: this.nuevoCliente.email?.trim() || null,
        direccion: this.nuevoCliente.direccion?.trim() || null,
        notas: this.nuevoCliente.notas?.trim() || null,
        activo: this.editando.activo
      } as any).subscribe({
        next: () => {
          const idx = this.clientes.findIndex(x => x.id === this.editando!.id);
          if (idx > -1) {
            this.clientes[idx] = {
              ...this.clientes[idx],
              nombre: this.nuevoCliente.nombre!.trim(),
              nit: this.nuevoCliente.nit?.trim() || null,
              telefono: this.nuevoCliente.telefono?.trim() || null,
              email: this.nuevoCliente.email?.trim() || null,
              direccion: this.nuevoCliente.direccion?.trim() || null,
              notas: this.nuevoCliente.notas?.trim() || null
            } as Cliente;
          }
          this.actualizarContadores();
          this.aplicarFiltros();
          this.Toast.fire({ icon: 'success', title: 'Cliente actualizado' });
          this.cargando = false;
          this.cerrarModal();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.swalError(err?.error?.message || 'NIT o Email ya existe en otro cliente.');
          } else if (err?.status === 400) {
            this.swalError('Solicitud inválida (Id del body debe coincidir).');
          } else {
            this.swalError('Error al actualizar el cliente');
          }
          this.cargando = false;
        }
      });
      return;
    }

    // Crear
    this.svc.create({
      nombre: this.nuevoCliente.nombre!.trim(),
      nit: this.nuevoCliente.nit?.trim() || null,
      telefono: this.nuevoCliente.telefono?.trim() || null,
      email: this.nuevoCliente.email?.trim() || null,
      direccion: this.nuevoCliente.direccion?.trim() || null,
      notas: this.nuevoCliente.notas?.trim() || null,
      activo: true
    }).subscribe({
      next: (cli) => {
        this.clientes.unshift(cli);
        this.actualizarContadores();
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Cliente creado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.swalError(err?.error?.message || 'NIT o Email ya existe.');
        } else {
          this.swalError('Error al guardar el cliente');
        }
        this.cargando = false;
      }
    });
  }

  async eliminarCliente(): Promise<void> {
    if (!this.editando) return;

    const result = await Swal.fire({
      title: '¿Eliminar cliente?',
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
        this.clientes = this.clientes.filter(x => x.id !== this.editando!.id);
        this.actualizarContadores();
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: 'Cliente eliminado' });
        this.cargando = false;
        this.cerrarModal();
      },
      error: (err) => {
        if (err?.status === 401 || err?.status === 403) {
          this.swalError('No tienes permisos para eliminar este cliente.');
        } else {
          this.swalError('No se pudo eliminar el cliente');
        }
        this.cargando = false;
      }
    });
  }

  // ===== Estado (lista) =====
  async confirmarToggle(c: Cliente): Promise<void> {
    const activar = !c.activo;
    const result = await Swal.fire({
      title: activar ? '¿Activar cliente?' : '¿Desactivar cliente?',
      text: `"${c.nombre}" cambiará de estado.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: activar ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    this.cambiarEstado(c);
  }

  cambiarEstado(c: Cliente): void {
    this.cargandoFila[c.id] = true;
    const previo = c.activo;
    c.activo = !c.activo; // optimista

    this.svc.toggleActivo(c.id, c.activo).subscribe({
      next: (resp) => {
        c.activo = resp.activo;
        this.actualizarContadores();
        this.aplicarFiltros();
        this.Toast.fire({ icon: 'success', title: `Cliente ${resp.activo ? 'activado' : 'desactivado'}` });
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
  setTab(tab: EstadoTab): void {
    if (this.estadoTab === tab) return;
    this.estadoTab = tab;
    this.paginaActual = 0;
    this.aplicarFiltros();
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.aplicarFiltros(), 250);
  }

  aplicarFiltros(): void {
    let filtrados = [...this.clientes];

    const term = (this.searchTerm || '').trim().toLowerCase();
    if (term) {
      filtrados = filtrados.filter(c =>
        (c.nombre || '').toLowerCase().includes(term) ||
        (c.nit || '').toLowerCase().includes(term) ||
        (c.telefono || '').toLowerCase().includes(term)
      );
    }

    // estadoTab
    if (this.estadoTab === 'activos') {
      filtrados = filtrados.filter(c => c.activo);
    } else if (this.estadoTab === 'inactivos') {
      filtrados = filtrados.filter(c => !c.activo);
    }

    this.clientesFiltrados = filtrados;
    this.paginaActual = 0;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    this.inicio = this.paginaActual * this.itemsPorPagina;
    this.fin = this.inicio + this.itemsPorPagina;
    this.totalPaginas = Math.max(1, Math.ceil(this.clientesFiltrados.length / this.itemsPorPagina));
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

  // ===== Contadores =====
  private actualizarContadores(): void {
    this.countActivos = this.clientes.filter(c => c.activo).length;
    this.countInactivos = this.clientes.length - this.countActivos;
    this.countTodos = this.clientes.length;
  }

  // ===== Utils =====
  private swalError(text: string): void {
    Swal.fire({ icon: 'error', title: 'Ups…', text });
  }
}
