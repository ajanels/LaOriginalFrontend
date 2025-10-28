import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PedidosProveedores } from './proveedores';

describe('Proveedores', () => {
  let component: PedidosProveedores;
  let fixture: ComponentFixture<PedidosProveedores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidosProveedores]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PedidosProveedores);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
