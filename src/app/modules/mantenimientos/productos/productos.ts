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
  private svc     = inject(ProductosService);
  private catSvc  = inject(CategoriasService);
  private provSvc = inject(ProveedoresService);

  // ===== Estado UI / filtros =====
  loading   = signal(false);
  items     = signal<ProductoListItem[]>([]);
  term      = signal('');
  view      = signal<'activos'|'inactivos'|'todos'>('activos');
  catId     = signal<number>(0);

  categorias = signal<Opt[]>([]);
  proveedores = signal<Opt[]>([]);

  // ===== Paginación (1-based) =====
  page     = signal(1);
  pageSize = signal(7);

  // ===== Crear =====
  showCreate = false;
  cNombre = ''; cCategoriaId: number | null = null; cProveedorId: number | null = null;
  cActivo = true; cCompra: number | null = null; cVenta: number | null = null;
  cFile: File | null = null; cPreview: string | null = null;

  // ===== Editar =====
  showEdit = false;
  eId!: number; eNombre=''; eCategoriaId: number | null = null; eActivo = true;
  eCompra: number | null = null; eVenta: number | null = null;
  eFotoUrl: string | null = null; eFile: File | null = null; ePreview: string | null = null;

  saving = false;

  ngOnInit(): void {
    this.loadCatalogs();
    this.reload();
  }

  private loadCatalogs(): void {
    this.catSvc.list(true).subscribe({
      next: l => this.categorias.set((l || []).map(x => ({id:x.id, nombre:x.nombre}))),
      error: e => { if (e?.status === 0) this.swalError(e); }
    });
    this.provSvc.list(true).subscribe({
      next: l => this.proveedores.set((l || []).map(x => ({id:x.id, nombre:x.nombre}))),
      error: e => { if (e?.status === 0) this.swalError(e); }
    });
  }

  reload(): void {
    this.loading.set(true);
    this.svc.list({ term: this.term() || '', soloActivos: false }).subscribe({
      next: rows => { this.items.set(rows || []); this.loading.set(false); this.page.set(1); },
      // Solo avisar si NO hay conexión; otros errores de listado quedan silenciosos
      error: (e) => {
        this.items.set([]);
        this.loading.set(false);
        if (e?.status === 0) this.swalError(e); // "Ups… Sin conexión con el servidor"
      }
    });
  }

  // ===== Derivados =====
  activosCount   = computed(() => this.items().filter(p => p.activo).length);
  inactivosCount = computed(() => this.items().filter(p => !p.activo).length);

  filtered = computed(() => {
    const t = this.term().trim().toLowerCase();
    const cat = this.catId();
    const cats = this.categorias();

    let rows = this.items();

    if (cat && cats.length) {
      rows = rows.filter((p: any) => (typeof p.categoriaId === 'number')
        ? p.categoriaId === cat
        : (p.categoria || '').toLowerCase() === (cats.find(c => c.id === cat)?.nombre || '').toLowerCase()
      );
    }
    if (!t) return rows;

    return rows.filter(p =>
      (p.nombre || '').toLowerCase().includes(t) ||
      (p.codigo || '').toLowerCase().includes(t) ||
      (p.categoria || '').toLowerCase().includes(t)
    );
  });

  listForView = computed(() =>
    this.view()==='activos'   ? this.filtered().filter(p =>  p.activo) :
    this.view()==='inactivos' ? this.filtered().filter(p => !p.activo) :
                                this.filtered()
  );

  total = computed(() => this.listForView().length);
  pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  pageItems = computed(() => {
    const size = this.pageSize();
    const pg   = Math.min(this.page(), this.pageCount());
    const start = (pg - 1) * size;
    return this.listForView().slice(start, start + size);
  });

  // ===== UI actions =====
  onSearch(ev: Event): void { this.term.set((ev.target as HTMLInputElement).value || ''); this.page.set(1); }
  setView(v:'activos'|'inactivos'|'todos'): void { if (this.view()!==v){ this.view.set(v); this.page.set(1); } }
  setCategoria(id: number): void { this.catId.set(Number(id||0)); this.page.set(1); }
  clearCategoria(): void { this.catId.set(0); this.page.set(1); }

  prev(): void { if (this.page()>1) this.page.set(this.page()-1); }
  next(): void { if (this.page()<this.pageCount()) this.page.set(this.page()+1); }

  foto(p: ProductoListItem){ return p.fotoUrl || '/assets/no-image.png'; }

  // ===== Crear (abre modal) =====
  openCreate(): void {
    this.cNombre=''; this.cCategoriaId = this.categorias()[0]?.id ?? null;
    this.cProveedorId = this.proveedores()[0]?.id ?? null;
    this.cActivo=true; this.cCompra=null; this.cVenta=null;
    this.cFile=null; this.cPreview=null; this.showCreate=true;
  }
  closeCreate(): void { this.showCreate=false; }

  onFileCreate(e:Event): void { const f=(e.target as HTMLInputElement).files?.[0]||null; this.setCreateFile(f); }
  onDropCreate(e:DragEvent): void { e.preventDefault(); const f=e.dataTransfer?.files?.[0]||null; this.setCreateFile(f); }
  private setCreateFile(file: File | null): void {
    if(!file){ this.cFile=null; this.cPreview=null; return; }
    if(!/image\/(png|jpeg|webp)/.test(file.type)){ this.Toast.fire({icon:'warning',title:'Imagen no soportada'}); return; }
    if(file.size>5*1024*1024){ this.Toast.fire({icon:'warning',title:'Máx 5MB'}); return; }
    this.cFile=file; const rd=new FileReader(); rd.onload=()=>this.cPreview=String(rd.result); rd.readAsDataURL(file);
  }

  crear(): void {
    if(!this.cNombre || !this.cCategoriaId || !this.cProveedorId || this.cCompra==null || this.cVenta==null || !this.cFile){
      this.Toast.fire({icon:'warning',title:'Completa los campos requeridos'}); return;
    }
    const compra=Number(this.cCompra), venta=Number(this.cVenta);
    if(!(isFinite(compra)&&compra>0)){ this.Toast.fire({icon:'warning',title:'Compra > 0'}); return; }
    if(!(isFinite(venta)&&venta>0))  { this.Toast.fire({icon:'warning',title:'Venta > 0'}); return; }
    if(venta<compra){ this.Toast.fire({icon:'warning',title:'Venta no puede ser menor a compra'}); return; }

    this.saving=true;
    this.svc.uploadImage(this.cFile!).subscribe({
      next: ({url})=>{
        const dto: ProductoCreatePayload = {
          nombre: this.cNombre.trim(),
          categoriaId: this.cCategoriaId!, proveedorId: this.cProveedorId!,
          fotoUrl: url, precioCompraDefault: compra, precioVentaDefault: venta, activo: this.cActivo
        };
        this.svc.create(dto).subscribe({
          next: _ => { this.saving=false; this.showCreate=false; this.Toast.fire({icon:'success',title:'Producto creado'}); this.reload(); },
          error: e => { this.saving=false; this.swalError(e, 'No se pudo crear'); }
        });
      },
      error: e => { this.saving=false; this.swalError(e, 'No se pudo subir imagen'); }
    });
  }

  // ===== Editar =====
  editar(p: ProductoListItem): void {
    this.svc.getById(p.id).subscribe({
      next: (d: ProductoDetail) => {
        this.eId=d.id; this.eNombre=d.nombre;
        this.eCategoriaId=d.categoriaId ?? null; this.eActivo=d.activo;
        this.eCompra=d.precioCompraDefault ?? null; this.eVenta=d.precioVentaDefault ?? null;
        this.eFotoUrl=d.fotoUrl || null; this.eFile=null; this.ePreview=null;
        this.showEdit=true;
      },
      error: e => this.swalError(e,'No se pudo abrir edición')
    });
  }
  closeEdit(): void { this.showEdit=false; }

  onFileEdit(e:Event): void { const f=(e.target as HTMLInputElement).files?.[0]||null; this.setEditFile(f); }
  onDropEdit(e:DragEvent): void { e.preventDefault(); const f=e.dataTransfer?.files?.[0]||null; this.setEditFile(f); }
  private setEditFile(file: File | null): void {
    if(!file){ this.eFile=null; this.ePreview=null; return; }
    if(!/image\/(png|jpeg|webp)/.test(file.type)){ this.Toast.fire({icon:'warning',title:'Imagen no soportada'}); return; }
    if(file.size>5*1024*1024){ this.Toast.fire({icon:'warning',title:'Máx 5MB'}); return; }
    this.eFile=file; const rd=new FileReader(); rd.onload=()=>this.ePreview=String(rd.result); rd.readAsDataURL(file);
  }

  guardarEdicion(): void {
    if(!this.eNombre || !this.eCategoriaId){ this.Toast.fire({icon:'warning',title:'Completa los campos'}); return; }
    const compra=Number(this.eCompra), venta=Number(this.eVenta);
    if(!(isFinite(compra)&&compra>0)){ this.Toast.fire({icon:'warning',title:'Compra > 0'}); return; }
    if(!(isFinite(venta)&&venta>0))  { this.Toast.fire({icon:'warning',title:'Venta > 0'}); return; }
    if(venta<compra){ this.Toast.fire({icon:'warning',title:'Venta no puede ser menor a compra'}); return; }

    this.saving=true;
    const doUpdate = (fotoUrl?:string): void =>{
      const dto: ProductoUpdatePayload = {
        id:this.eId, nombre:this.eNombre.trim(), categoriaId:this.eCategoriaId!, fotoUrl: fotoUrl ?? this.eFotoUrl ?? '', activo:this.eActivo
      };
      this.svc.update(this.eId, dto).subscribe({
        next: () => {
          this.svc.updateDefaultPrices(this.eId,{precioCompraDefault:compra,precioVentaDefault:venta}).subscribe({
            next: () => { this.saving=false; this.showEdit=false; this.Toast.fire({icon:'success',title:'Cambios guardados'}); this.reload(); },
            error: e => { this.saving=false; this.swalError(e,'No se pudieron actualizar los precios'); }
          });
        },
        error: e => { this.saving=false; this.swalError(e,'No se pudo actualizar el producto'); }
      });
    };
    if(this.eFile){
      this.svc.uploadImage(this.eFile).subscribe({
        next: ({url})=>doUpdate(url),
        error: e=>{ this.saving=false; this.swalError(e,'No se pudo subir imagen'); }
      });
    } else {
      doUpdate();
    }
  }

  eliminar(p: ProductoListItem): void {
    Swal.fire({
      icon:'warning', title:'¿Eliminar producto?', text:p.nombre,
      showCancelButton:true, confirmButtonText:'Sí, eliminar', confirmButtonColor:'#d33'
    }).then(r=>{
      if(!r.isConfirmed) return;
      this.svc.delete(p.id).subscribe({
        next: ()=>{ this.Toast.fire({icon:'success',title:'Producto eliminado'}); this.reload(); },
        error: e => this.swalError(e,'No se pudo eliminar')
      });
    });
  }

  // ===== Utils =====
  private Toast = Swal.mixin({
    toast:true, position:'top-end', showConfirmButton:false, timer:2500, timerProgressBar:true,
    didOpen:t=>{ t.addEventListener('mouseenter',Swal.stopTimer); t.addEventListener('mouseleave',Swal.resumeTimer); }
  });

  private extractError(e:any): string {
    try{
      if(e?.status===0) return 'No se pudieron cargar los productos.';
      if(typeof e?.error==='string') return e.error;
      const err=e?.error;
      if(err?.detail||err?.title||err?.message) return err.detail||err.title||err.message;
      return `Error ${e?.status||''} ${e?.statusText||''}`.trim();
    }catch{ return 'Ocurrió un error.'; }
  }

  /** Estilo “Ups…” (como proveedores). Si hay detalle del backend lo muestra; si no, usa fallback. */
  private swalError(e:any, fallback?:string): void {
    const text = this.extractError(e) || fallback || 'Ocurrió un error.';
    Swal.fire({ icon: 'error', title: 'Ups…', text });
  }

  trackByProdId = (_:number, it:ProductoListItem)=> it.id;
  trackById = (_:number, it:Opt)=> it.id;
}
