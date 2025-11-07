import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InventarioService, StockRow, KardexItem } from '../../services/inventario.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-inventario',
  standalone: true,
  templateUrl: './inventario.html',
  styleUrls: ['./inventario.css'],
  imports: [CommonModule, FormsModule, DecimalPipe],
})
export class InventarioComponent implements OnInit {
  private inv = inject(InventarioService);
  private router = inject(Router);

  // ====== Listado ======
  loading = false;
  q = '';
  rows: StockRow[] = [];

  // ====== Paginación (8 por página) ======
  page = 0;               // índice 0-based
  pageSize = 8;

  get viewRows(): StockRow[] {
    const t = (this.q || '').toLowerCase();
    if (!t) return this.rows;
    return this.rows.filter(r =>
      (r.producto || '').toLowerCase().includes(t) ||
      ((r.productoCodigo || '').toLowerCase().includes(t))
    );
  }

  get total(): number { return this.viewRows.length; }
  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }

  private ensureValidPage(): void {
    const last = Math.max(0, this.totalPages - 1);
    if (this.page > last) this.page = 0;
    if (this.page < 0) this.page = 0;
  }

  get pagedRows(): StockRow[] {
    this.ensureValidPage();
    const start = this.page * this.pageSize;
    return this.viewRows.slice(start, start + this.pageSize);
  }

  canPrev(): boolean { return this.page > 0; }
  canNext(): boolean { return this.page < this.totalPages - 1; }
  prev(): void { if (this.canPrev()) this.page--; }
  next(): void { if (this.canNext()) this.page++; }

  // ====== Modales ======
  showKardex = false;
  showAjuste = false;
  showBajos = false;
  sel: StockRow | null = null;

  // ====== Kardex ======
  kardex: KardexItem[] = [];
  kardexLoading = false;
  kardexDesde?: string;
  kardexHasta?: string;

  // ====== Ajuste ======
  ajCantidad: number | null = null;
  ajCosto: number | null = null;
  ajMotivo: string | null = null;
  ajTipo: 'entrada' | 'salida' = 'entrada';
  ajSaving = false;

  // ====== Mínimo ======
  editMin: { id: number, value: number } | null = null;

  ngOnInit() { this.reload(); }

  // ================== Helpers de notificaciones ==================
  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    target: '.page',
    customClass: { popup: 'swal-toast' },
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  private extractError(e: any): string {
    try {
      if (e?.status === 0) return 'No hay conexión con el servidor.';
      if (typeof e?.error === 'string') return e.error;
      const err = e?.error;
      if (err?.detail || err?.title || err?.message) return (err.detail || err.title || err.message);
      return `Error ${e?.status || ''} ${e?.statusText || ''}`.trim();
    } catch { return 'Error desconocido.'; }
  }
  private swalErrorFrom(e: any, titulo = 'Error'): void {
    Swal.fire({ icon: 'error', title: titulo, text: this.extractError(e), confirmButtonText: 'Entendido' });
  }
  private showInfo(msg: string) { Swal.fire({ icon: 'info', title: 'Información', text: msg }); }
  private showWarning(msg: string) { Swal.fire({ icon: 'warning', title: 'Atención', text: msg }); }

  // ================== Stock ==================
  reload() {
    this.loading = true;
    this.inv.getStock().subscribe({
      next: d => { this.rows = d || []; this.loading = false; this.page = 0; this.ensureValidPage(); },
      error: e => { this.rows = []; this.loading = false; this.swalErrorFrom(e, 'No se pudo cargar inventario'); }
    });
  }
  onSearch(v: string) { this.q = v || ''; this.page = 0; }

  // ================== Kardex ==================
  openKardex(r: StockRow) {
    this.sel = r;
    this.showKardex = true;
    this.kardex = [];
    this.loadKardex();
  }
  closeKardex() {
    this.showKardex = false;
    this.kardex = [];
  }

  loadKardex() {
    if (!this.sel) return;
    this.kardexLoading = true;
    this.inv.getKardex(this.sel.presentacionId, this.kardexDesde, this.kardexHasta).subscribe({
      next: k => { this.kardex = k || []; this.kardexLoading = false; },
      error: e => { this.kardex = []; this.kardexLoading = false; this.swalErrorFrom(e, 'No se pudo cargar kardex'); }
    });
  }

  exportKardexCsv() {
    if (!this.kardex.length) return;
    const rows = [
      ['Fecha','Tipo','Cantidad','Costo','Precio','Documento','Notas'],
      ...this.kardex.map(k => {
        const fecha = new Date((k as any).fechaUtc ?? (k as any).fecha);
        return [
          isNaN(fecha.getTime()) ? '' : fecha.toLocaleString(),
          (k as any).tipo ?? '',
          (k as any).cantidad ?? '',
          (k as any).costoUnitario ?? '',
          (k as any).precioUnitario ?? '',
          `${(k as any).documento || ''}${(k as any).documentoId ? ` #${(k as any).documentoId}` : ''}`,
          (k as any).notas || ''
        ];
      })
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${this.sel?.productoCodigo || this.sel?.producto || 'presentacion'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printKardex() {
    if (!this.kardex.length) { this.showInfo('No hay datos para imprimir'); return; }
    const w = window.open('', '_blank');
    if (!w) { this.showWarning('El navegador bloqueó la ventana de impresión'); return; }

    const body = this.kardex.map(k => {
      const fecha = new Date((k as any).fechaUtc ?? (k as any).fecha);
      return `
        <tr>
          <td>${isNaN(fecha.getTime()) ? '' : fecha.toLocaleString()}</td>
          <td>${(k as any).tipo ?? ''}</td>
          <td>${(k as any).cantidad ?? ''}</td>
          <td>${(k as any).costoUnitario ?? '—'}</td>
          <td>${(k as any).notas ?? '—'}</td>
        </tr>`;
    }).join('');

    const html = `
      <html>
      <head>
        <title>Kardex - ${this.sel?.producto ?? ''}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
          h2 { margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background: #f4f4f4; }
        </style>
      </head>
      <body>
        <h2>Kardex - ${this.sel?.producto ?? ''}</h2>
        <table>
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Costo</th><th>Notas</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
        <script>window.addEventListener('load', () => window.print());</script>
      </body>
      </html>
    `;
    w.document.open(); w.document.write(html); w.document.close();
  }

  trackByKardex(index: number, _item: KardexItem) { return index; }

  // ================== Ajuste ==================
  openAjuste(r: StockRow) {
    this.sel = r;
    this.ajCantidad = this.ajCosto = null;
    this.ajMotivo = null;
    this.ajTipo = 'entrada';
    this.showAjuste = true;
  }
  closeAjuste() { this.showAjuste = false; }

  guardarAjuste() {
    if (!this.sel || !this.ajCantidad || this.ajCantidad <= 0) {
      this.showWarning('La cantidad debe ser mayor a 0');
      return;
    }
    if (this.ajTipo === 'entrada' && (!this.ajCosto || this.ajCosto <= 0)) {
      this.showWarning('El costo unitario es obligatorio en entradas');
      return;
    }

    this.ajSaving = true;
    this.inv.postAjuste({
      presentacionId: this.sel.presentacionId,
      cantidad: this.ajCantidad,
      tipo: this.ajTipo,
      motivo: this.ajMotivo ?? undefined,
      costoUnitario: this.ajTipo === 'entrada' ? this.ajCosto! : undefined
    }).subscribe({
      next: () => {
        this.ajSaving = false;
        this.closeAjuste();
        this.reload();
        this.Toast.fire({icon:'success', title:'Ajuste registrado correctamente'});
      },
      error: e => { this.ajSaving = false; this.swalErrorFrom(e, 'No se pudo registrar ajuste'); }
    });
  }

  // ================== Editar mínimo ==================
  abrirEditarMin(r: StockRow) {
    this.editMin = { id: r.presentacionId, value: Number(r.minimo ?? 0) };
  }
  guardarMinimo() {
    if (!this.editMin) return;
    this.inv.actualizarMinimo(this.editMin.id, Number(this.editMin.value || 0)).subscribe({
      next: () => {
        this.editMin = null;
        this.reload();
        this.Toast.fire({icon:'success', title:'Mínimo actualizado'});
      },
      error: e => {
        this.editMin = null;
        this.swalErrorFrom(e, 'No se pudo actualizar mínimo');
      }
    });
  }
  cancelarEditar() { this.editMin = null; }

  // ================== Productos bajos ==================
  generarPedidoBajos() {
    const bajos = this.rows.filter(r => r.bajoMinimo);
    if (!bajos.length) { this.showInfo('No hay productos en bajo stock'); return; }
    this.showBajos = true;
  }
  closeBajos() { this.showBajos = false; }

  get bajosStock(): StockRow[] { return this.rows.filter(r => r.bajoMinimo); }
}
