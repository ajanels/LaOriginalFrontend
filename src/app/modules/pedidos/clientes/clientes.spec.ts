import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PedidosClientesComponent } from './clientes';

describe('Clientes', () => {
  let component: PedidosClientesComponent;
  let fixture: ComponentFixture<PedidosClientesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidosClientesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PedidosClientesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
