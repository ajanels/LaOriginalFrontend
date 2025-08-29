import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private _collapsed$ = new BehaviorSubject<boolean>(false);
  collapsed$ = this._collapsed$.asObservable();

  get collapsed(): boolean { return this._collapsed$.value; }
  toggle(): void { this._collapsed$.next(!this._collapsed$.value); }
  set(value: boolean) { this._collapsed$.next(value); }
}
