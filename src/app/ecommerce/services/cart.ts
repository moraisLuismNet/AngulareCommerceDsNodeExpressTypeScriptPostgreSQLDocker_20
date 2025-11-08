import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs";
import { catchError, tap, takeUntil } from "rxjs/operators";
import { UserService } from "src/app/services/user";
import { IRecord, ICart } from "../ecommerce.interface";
import { CartDetailService } from "./cart-detail";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { environment } from "src/environments/environment";
import { AuthGuard } from "src/app/guards/auth-guard";
import { StockService } from "./stock";

@Injectable({
  providedIn: "root",
})
export class CartService implements OnDestroy {
  private readonly urlAPI = environment.urlAPI;
  private readonly cart: IRecord[] = [];
  private cartSubject = new BehaviorSubject<IRecord[]>([]);
  private cartItemCountSubject = new BehaviorSubject<number>(0);
  readonly cartItemCount$ = this.cartItemCountSubject.asObservable();
  readonly cart$ = this.cartSubject.asObservable();
  private cartTotalSubject = new BehaviorSubject<number>(0);
  readonly cartTotal$ = this.cartTotalSubject.asObservable();
  private readonly destroy$ = new Subject<void>();
  cartEnabledSubject = new BehaviorSubject<boolean>(true);
  readonly cartEnabled$ = this.cartEnabledSubject.asObservable();

  constructor(
    private readonly httpClient: HttpClient,
    private readonly authGuard: AuthGuard,
    private readonly userService: UserService,
    private readonly cartDetailService: CartDetailService,
    private readonly stockService: StockService
  ) {
    this.initializeCart();
  }

  private initializeCart(): void {
    this.setupUserSubscription();
  }

  private setupUserSubscription(): void {
    this.userService.emailUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((email) => {
        if (email) {
          this.initializeCartForUser(email);
        } else {
          this.resetCart();
        }
      });
  }

  private initializeCartForUser(email: string): void {
    // First we try to load from localStorage
    const savedCart = this.getCartForUser(email);
    if (savedCart && savedCart.length > 0) {
      this.cartSubject.next(savedCart);
      this.cartItemCountSubject.next(savedCart.length);
      this.calculateAndUpdateLocalTotal();
    }

    // Then we sync with the backend
    this.syncCartWithBackend(email);
  }

  resetCart(): void {
    this.cartSubject.next([]);
    this.cartItemCountSubject.next(0);
    this.cartTotalSubject.next(0);
  }

  private updateCartState(cartItems: IRecord[]): void {
    this.cartSubject.next(cartItems);
    this.cartItemCountSubject.next(
      cartItems.reduce((total, item) => total + (Number(item.Amount) || 1), 0)
    );
    this.calculateAndUpdateLocalTotal();
    this.saveCartForUser(this.userService.email || "", cartItems);
  }

  private shouldSyncCart(email: string | null): boolean {
    // Check all necessary conditions
    return (
      !!email && this.cartEnabledSubject.value && this.authGuard.isLoggedIn()
    );
  }
  syncCartWithBackend(email: string): void {
    if (!email) return;

    this.cartDetailService
      .getCartDetails(email)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (response: any) => {
          // Handle both array response and object with $values property
          const cartDetails = Array.isArray(response)
            ? response
            : response?.$values || [];
          const updatedCart = cartDetails.map((detail: any) => ({
            IdRecord: detail.recordId,
            TitleRecord: detail.titleRecord,
            ImageRecord: detail.imageRecord,
            Amount: detail.amount || 1,
            Price: detail.price || 0,
            inCart: true,
            idRecord: detail.recordId,
            price: Number(detail.price) || 0,
            title: detail.titleRecord,
            image: detail.imageRecord,
            stock: detail.stock || 0,
          }));

          // Update the inCart status of existing records
          const records = this.cartSubject.value;
          records.forEach((record) => {
            const inCart = updatedCart.some(
              (item: IRecord) => item.IdRecord === record.IdRecord
            );
            record.inCart = inCart;
            if (!inCart) {
              record.Amount = 0;
            }
          });

          this.updateCartState(updatedCart);
        },
        (error) => {
          console.error("Error syncing cart with backend:", error);
          this.resetCart();
        }
      );
  }

  addToCart(record: IRecord): Observable<any> {
    const userEmail = this.userService.email;
    if (!userEmail) return throwError(() => new Error("Unauthenticated user"));

    return this.cartDetailService
      .addToCartDetail(userEmail, record.IdRecord, 1)
      .pipe(
        tap((updatedRecord: any) => {
          // Get current cart
          const currentCart = this.cartSubject.value;

          // Update the cart item
          const existingItem = currentCart.find(
            (item) => item.IdRecord === record.IdRecord
          );
          if (existingItem) {
            existingItem.Amount = (existingItem.Amount || 0) + 1;
            existingItem.stock = updatedRecord?.stock || existingItem.stock;
          } else {
            currentCart.push({
              ...record,
              Amount: 1,
              inCart: true,
              stock: updatedRecord?.stock || record.stock,
            });
          }

          // Update cart state
          this.updateCartState(currentCart);
          this.stockService.notifyStockUpdate(
            record.IdRecord,
            updatedRecord?.stock
          );
        }),
        catchError((error) => {
          console.error("Error adding to cart:", error);
          return throwError(() => error);
        })
      );
  }

  removeFromCart(record: IRecord): Observable<any> {
    const userEmail = this.userService.email;
    if (!userEmail) {
      return throwError(() => new Error("Unauthenticated user"));
    }
    return this.cartDetailService
      .removeFromCartDetail(userEmail, record.IdRecord, 1)
      .pipe(
        tap((updatedRecord: any) => {
          // Get current cart
          const currentCart = this.cartSubject.value;
          // Update the cart item
          const existingItem = currentCart.find(
            (item) => item.IdRecord === record.IdRecord
          );
          if (existingItem) {
            existingItem.Amount = Math.max(0, (existingItem.Amount || 0) - 1);
            existingItem.stock = updatedRecord?.stock || existingItem.stock;
            // Remove item if amount reaches 0
            if (existingItem.Amount === 0) {
              const index = currentCart.indexOf(existingItem);
              if (index !== -1) {
                currentCart.splice(index, 1);
              }
            }
          }
          // Update cart state
          this.updateCartState(currentCart);
          this.stockService.notifyStockUpdate(
            record.IdRecord,
            updatedRecord?.stock
          );
        }),
        catchError((error) => {
          console.error("Error removing from cart:", error);
          return throwError(() => error);
        })
      );
  }

  updateCartNavbar(itemCount: number, totalPrice: number): void {
    this.cartItemCountSubject.next(itemCount);
    this.cartTotalSubject.next(totalPrice);
  }

  getCartForUser(email: string): IRecord[] {
    const cartJson = localStorage.getItem(`cart_${email}`);
    return cartJson ? JSON.parse(cartJson) : [];
  }

  getCartItems(): Observable<IRecord[]> {
    return this.cart$;
  }

  saveCartForUser(email: string, cart: IRecord[]): void {
    localStorage.setItem(`cart_${email}`, JSON.stringify(cart));
  }

  updateCartItem(record: IRecord): void {
    const currentCart = this.cartSubject.value;
    const index = currentCart.findIndex(
      (item) => item.IdRecord === record.IdRecord
    );

    if (index !== -1) {
      currentCart[index] = { ...record };
      this.cartSubject.next([...currentCart]);
      this.updateCartCount(currentCart);
      this.calculateAndUpdateLocalTotal();
      this.saveCartForUser(this.userService.email || "", currentCart);
    }
  }

  getCart(email: string): Observable<ICart> {
    const headers = this.getHeaders();
    return this.httpClient
      .get<ICart>(`${this.urlAPI}Carts/${email}`, { headers })
      .pipe(
        catchError((error) => {
          console.error("Error getting cart:", error);
          return this.httpClient.get<ICart>(
            `${this.urlAPI}Carts/GetCartByEmail/${email}`,
            { headers }
          );
        })
      );
  }

  private getHeaders(): HttpHeaders {
    const token = this.authGuard.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getAllCarts(): Observable<ICart[]> {
    const headers = this.getHeaders();
    return this.httpClient
      .get<ICart[]>(`${this.urlAPI}Carts`, { headers })
      .pipe(
        catchError((error) => {
          console.error("Error getting all carts:", error);
          return throwError(() => error);
        })
      );
  }

  disableCart(email: string): Observable<ICart> {
    const headers = this.getHeaders();
    return this.httpClient
      .post<ICart>(
        `${this.urlAPI}carts/disable/${encodeURIComponent(email)}`,
        {},
        {
          headers,
          withCredentials: true, // Important for sending cookies with CORS
        }
      )
      .pipe(
        tap((disabledCart) => {
          // Update local status immediately
          const currentCart = this.cartSubject.value;
          const updatedCart = currentCart.map((item) => ({
            ...item,
            price: 0,
            amount: 0,
          }));
          this.updateCartState(updatedCart);
        }),
        catchError((error) => {
          console.error("Error disabling cart:", error);
          return throwError(() => error);
        })
      );
  }

  enableCart(email: string): Observable<any> {
    const headers = this.getHeaders();
    return this.httpClient
      .post(`${this.urlAPI}Carts/Enable/${email}`, {}, { headers })
      .pipe(
        catchError((error) => {
          console.error("Error enabling cart:", error);
          return throwError(() => error);
        })
      );
  }

  private updateCartCount(cart: IRecord[]): void {
    const totalItems = cart.reduce(
      (total: number, item: IRecord) => total + (item.Amount || 1),
      0
    );
    this.cartItemCountSubject.next(totalItems);
  }

  private calculateAndUpdateLocalTotal(): void {
    const total = this.cartSubject.value.reduce(
      (sum: number, item: IRecord) => {
        const price = Number(item.Price) || 0;
        const amount = Number(item.Amount) || 1;
        return sum + price * amount;
      },
      0
    );
    this.cartTotalSubject.next(total);
  }

  getCartStatus(email: string): Observable<{ enabled: boolean }> {
    const headers = this.getHeaders();
    return this.httpClient
      .get<{ enabled: boolean }>(
        `${this.urlAPI}carts/status/${encodeURIComponent(email)}`,
        { headers }
      )
      .pipe(
        tap((response) => {
          this.cartEnabledSubject.next(response.enabled);
        }),
        catchError((error) => {
          console.error("Error getting cart status:", error);
          // Default to enabled if there's an error or 404
          const enabled = error.status === 404 || error.status === 0;
          this.cartEnabledSubject.next(enabled);
          return of({ enabled });
        })
      );
  }
}
