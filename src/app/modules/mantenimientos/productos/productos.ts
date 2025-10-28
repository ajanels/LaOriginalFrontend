import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import {
  ProductosService,
  ProductoListItem,
  ProductoDetail,
  ProductoCreatePayload,
  ProductoUpdatePayload
} from '../../../services/productos.service';
import { CategoriasService } from '../../../services/categorias.service';
import { ProveedoresService } from '../../../services/proveedores.service';

type Opt = { id: number; nombre: string };

@Component({
  selector: 'app-mant-productos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './productos.html',
  styleUrls: ['./productos.css'],
})
export class MantProductosComponent implements OnInit {
  private svc = inject(ProductosService);
  private catSvc = inject(CategoriasService);
  private provSvc = inject(ProveedoresService);

  fallbackImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect width="100%" height="100%" fill="%23f5f5f5"/><text x="50%" y="55%" font-size="12" text-anchor="middle" fill="%23999">IMG</text></svg>';

  // listado
  loading = signal(false);
  productos = signal<ProductoListItem[]>([]);
  q = signal<string>('');
  categoriaId: number|null = null;
  soloActivos = true;

  filtered = computed(() => {
    const term = (this.q() || '').trim().toLowerCase();
    return this.productos().filter(p =>
      !term || p.nombre.toLowerCase().includes(term) || (p.codigo||'').toLowerCase().includes(term)
    );
  });

  // catálogos
  categorias: Opt[] = [];
  proveedores: Opt[] = [];

  // crear
  showCreate = false;
  cNombre = '';
  cCategoriaId: number | null = null;
  cProveedorId: number | null = null;
  cActivo = true;
  cCompra: number | null = null;
  cVenta: number | null = null;
  cFile: File | null = null;
  cPreview: string | null = null;

  // editar
  showEdit = false;
  eId!: number;
  eNombre = '';
  eCategoriaId: number | null = null;
  eActivo = true;
  eFotoUrl: string | null = null;
  eFile: File | null = null;
  ePreview: string | null = null;

  // NUEVO: precios en edición
  eCompra: number | null = null;
  eVenta: number | null = null;

  // estado
  saving = false;

  ngOnInit(): void {
    this.loadCatalogs();
    this.reload();
  }

  private loadCatalogs(): void {
    this.catSvc.list(true).subscribe({
      next: l => this.categorias = (l || []).map(x => ({id:x.id, nombre:x.nombre}))
    });
    this.provSvc.list(true).subscribe({
      next: l => this.proveedores = (l || []).map(x => ({id:x.id, nombre:x.nombre}))
    });
  }

  reload(): void {
    this.loading.set(true);
    this.svc.list({
      term: this.q(),
      categoriaId: this.categoriaId,
      soloActivos: this.soloActivos
    }).subscribe({
      next: rows => { this.productos.set(rows || []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.Toast.fire({icon:'error', title:'No se pudo cargar productos'}); }
    });
  }

  /* ===== Crear ===== */
  openCreate(): void {
    this.cNombre = '';
    this.cCategoriaId = this.categorias[0]?.id ?? null;
    this.cProveedorId = this.proveedores[0]?.id ?? null;
    this.cActivo = true;
    this.cCompra = 0; this.cVenta = 0;
    this.cFile = null; this.cPreview = null;
    this.showCreate = true;
  }
  closeCreate(): void { this.showCreate = false; }

  onFileCreate(ev: Event){ const f = (ev.target as HTMLInputElement).files?.[0] || null; this.setCreateFile(f); }
  onDropCreate(ev: DragEvent){ ev.preventDefault(); const f = ev.dataTransfer?.files?.[0] || null; this.setCreateFile(f); }
  private setCreateFile(file: File | null){
    if (!file){ this.cFile = null; this.cPreview = null; return; }
    if (!/image\/(png|jpeg|webp)/.test(file.type)){ this.Toast.fire({icon:'warning',title:'Imagen no soportada'}); return; }
    if (file.size > 5*1024*1024){ this.Toast.fire({icon:'warning', title:'Máx 5MB'}); return; }
    this.cFile = file; const rd = new FileReader(); rd.onload = () => this.cPreview = String(rd.result); rd.readAsDataURL(file);
  }

  crear(): void {
    if (!this.cNombre || !this.cCategoriaId || !this.cProveedorId || this.cCompra==null || this.cVenta==null || !this.cFile) {
      this.Toast.fire({icon:'warning',title:'Completa los campos requeridos'}); return;
    }
    const compra = Number(this.cCompra);
    const venta  = Number(this.cVenta);
    if (!(isFinite(compra) && compra > 0)) { this.Toast.fire({icon:'warning',title:'Precio de compra debe ser > 0'}); return; }
    if (!(isFinite(venta) && venta > 0))   { this.Toast.fire({icon:'warning',title:'Precio de venta debe ser > 0'}); return; }
    if (venta < compra) { this.Toast.fire({icon:'warning',title:'El precio de venta no puede ser menor al de compra'}); return; }

    this.saving = true;
    this.svc.uploadImage(this.cFile).subscribe({
      next: ({url}) => {
        const dto: ProductoCreatePayload = {
          nombre: this.cNombre.trim(),
          categoriaId: this.cCategoriaId!,
          proveedorId: this.cProveedorId!,
          fotoUrl: url,
          precioCompraDefault: compra,
          precioVentaDefault: venta,
          activo: this.cActivo
        };
        this.svc.create(dto).subscribe({
          next: () => {
            this.saving = false; this.closeCreate();
            this.Toast.fire({icon:'success', title:'Producto creado'}); this.reload();
          },
          error: e => { this.saving = false; this.swalError(e,'No se pudo crear'); }
        });
      },
      error: e => { this.saving = false; this.swalError(e,'No se pudo subir la imagen'); }
    });
  }

  /* ===== Editar ===== */
  openEdit(p: ProductoListItem): void {
    this.svc.getById(p.id).subscribe({
      next: (d: ProductoDetail) => {
        this.eId = d.id;
        this.eNombre = d.nombre;
        this.eCategoriaId = d.categoriaId ?? null;
        this.eActivo = d.activo;
        this.eFotoUrl = d.fotoUrl || null;
        this.eFile = null; this.ePreview = null;

        // precios actuales
        this.eCompra = d.precioCompraDefault ?? 0;
        this.eVenta  = d.precioVentaDefault ?? 0;

        this.showEdit = true;
      },
      error: e => this.swalError(e, 'No se pudo abrir edición')
    });
  }
  closeEdit(): void { this.showEdit = false; }

  onFileEdit(ev: Event){ const f = (ev.target as HTMLInputElement).files?.[0] || null; this.setEditFile(f); }
  onDropEdit(ev: DragEvent){ ev.preventDefault(); const f = ev.dataTransfer?.files?.[0] || null; this.setEditFile(f); }
  private setEditFile(file: File | null){
    if (!file){ this.eFile = null; this.ePreview = null; return; }
    if (!/image\/(png|jpeg|webp)/.test(file.type)){ this.Toast.fire({icon:'warning',title:'Imagen no soportada'}); return; }
    if (file.size > 5*1024*1024){ this.Toast.fire({icon:'warning', title:'Máx 5MB'}); return; }
    this.eFile = file; const rd = new FileReader(); rd.onload = () => this.ePreview = String(rd.result); rd.readAsDataURL(file);
  }

  guardarEdicion(): void {
    if (!this.eNombre || !this.eCategoriaId){ this.Toast.fire({icon:'warning',title:'Completa los campos'}); return; }

    // Validaciones de precios
    const compra = Number(this.eCompra);
    const venta  = Number(this.eVenta);
    if (!(isFinite(compra) && compra > 0)) { this.Toast.fire({icon:'warning',title:'Precio de compra debe ser > 0'}); return; }
    if (!(isFinite(venta) && venta > 0))   { this.Toast.fire({icon:'warning',title:'Precio de venta debe ser > 0'}); return; }
    if (venta < compra) { this.Toast.fire({icon:'warning',title:'El precio de venta no puede ser menor al de compra'}); return; }

    this.saving = true;

    const doUpdateAll = (fotoUrl?: string) => {
      // 1) actualizar datos básicos del producto
      const dto: ProductoUpdatePayload = {
        id: this.eId,
        nombre: this.eNombre.trim(),
        categoriaId: this.eCategoriaId!,
        fotoUrl: fotoUrl ?? this.eFotoUrl ?? '',
        activo: this.eActivo
      };

      this.svc.update(this.eId, dto).subscribe({
        next: () => {
          // 2) actualizar precios por defecto
          this.svc.updateDefaultPrices(this.eId, {
            precioCompraDefault: compra,
            precioVentaDefault:  venta
          }).subscribe({
            next: () => {
              this.saving = false; this.closeEdit();
              this.Toast.fire({icon:'success', title:'Cambios guardados'}); this.reload();
            },
            error: e => { this.saving = false; this.swalError(e,'No se pudo actualizar los precios'); }
          });
        },
        error: e => { this.saving = false; this.swalError(e,'No se pudo actualizar el producto'); }
      });
    };

    if (this.eFile) {
      this.svc.uploadImage(this.eFile).subscribe({
        next: ({url}) => doUpdateAll(url),
        error: e => { this.saving = false; this.swalError(e,'No se pudo subir imagen'); }
      });
    } else {
      doUpdateAll();
    }
  }

  /* ===== Eliminar ===== */
  eliminar(p: ProductoListItem): void {
    Swal.fire({icon:'warning', title:'¿Eliminar producto?', text:p.nombre, showCancelButton:true, confirmButtonText:'Sí, eliminar', confirmButtonColor:'#d33'})
    .then(r => {
      if (!r.isConfirmed) return;
      this.svc.delete(p.id).subscribe({
        next: () => { this.Toast.fire({icon:'success', title:'Producto eliminado'}); this.reload(); },
        error: e => this.swalError(e,'No se pudo eliminar')
      });
    });
  }

  /* ===== Utils ===== */
  private Toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:2500, timerProgressBar:true,
    didOpen: t=>{ t.addEventListener('mouseenter', Swal.stopTimer); t.addEventListener('mouseleave', Swal.resumeTimer); }});
  private extractError(e: any){ try{
    if (e?.status===0) return 'Sin conexión con el servidor';
    if (typeof e?.error==='string') return e.error;
    const err=e?.error; if (err?.detail||err?.title||err?.message) return err.detail||err.title||err.message;
    return `Error ${e?.status||''} ${e?.statusText||''}`.trim();
  }catch{ return 'Error desconocido'; } }
  private swalError(e:any, title='Error'){ Swal.fire({icon:'error', title, text:this.extractError(e)}); }

  trackByProdId = (_:number, it:ProductoListItem)=> it.id;
  trackByCategoriaId = (_:number, it:Opt)=> it.id;
  trackByProveedorId = (_:number, it:Opt)=> it.id;
}
