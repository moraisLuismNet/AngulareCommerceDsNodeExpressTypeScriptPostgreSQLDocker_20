import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import {
  catchError,
  Observable,
  of,
  tap,
  map,
  throwError,
  switchMap,
} from "rxjs";
import { environment } from "src/environments/environment";
import { AuthGuard } from "../../guards/auth-guard";
import { ICartDetail, IRecord } from "../ecommerce.interface";
import { UserService } from "src/app/services/user";
import { StockService } from "./stock";
import { RecordsService } from "./records";

@Injectable({
  providedIn: "root",
})
export class CartDetailService {
  urlAPI = environment.urlAPI;
  private cart: IRecord[] = [];
  constructor(
    private http: HttpClient,
    private authGuard: AuthGuard,
    private userService: UserService,
    private stockService: StockService,
    private recordsService: RecordsService
  ) {}

  getCartItemCount(email: string): Observable<any> {
    // Verify that the email matches the current user
    if (this.userService.email !== email) {
      return of({ totalItems: 0 });
    }
    return this.http.get(`${this.urlAPI}cart-details/count/${email}`).pipe(
      catchError((error) => {
        console.error("Error getting cart item count:", error);
        return of({ totalItems: 0 });
      })
    );
  }

  getCartDetails(email: string): Observable<any> {
    const url = `${this.urlAPI}cart-details/${encodeURIComponent(email)}`;
    return this.http.get(url).pipe(
      catchError((error) => {
        console.error("Error getting cart details:", error);
        return of([]);
      })
    );
  }

  getRecordDetails(recordId: number): Observable<IRecord | null> {
    return this.http.get<IRecord>(`${this.urlAPI}records/${recordId}`).pipe(
      catchError((error) => {
        console.error("Error getting record details:", error);
        return of(null);
      })
    );
  }

  addToCartDetail(
    email: string,
    recordId: number,
    amount: number
  ): Observable<any> {
    const headers = this.getHeaders();
    return this.http
      .post<{
        success: boolean;
        updatedStock: number;
        message: string;
        cartId: number;
      }>(
        `${this.urlAPI}cart-details/add/${encodeURIComponent(email)}`,
        {
          recordId: recordId,
          amount: amount,
        },
        { headers }
      )
      .pipe(
        tap((response) => {
          if (
            response &&
            response.success &&
            response.updatedStock !== undefined
          ) {
            // Use the updatedStock from the response instead of making another API call
            this.stockService.notifyStockUpdate(
              recordId,
              response.updatedStock
            );

            // Return the updated record with the new stock value
            return {
              id: recordId,
              stock: response.updatedStock,
              amount: amount,
              success: true,
              message: response.message,
            };
          } else {
            console.error(
              "[CartDetailService] Invalid response format:",
              response
            );
            return throwError(
              () => new Error(response?.message || "Failed to add item to cart")
            );
          }
        }),
        catchError((error) => {
          console.error("[CartDetailService] Error in addToCartDetail:", error);
          return throwError(() => error);
        })
      );
  }

  removeFromCartDetail(
    email: string,
    recordId: number,
    amount: number
  ): Observable<any> {
    const headers = this.getHeaders();
    return this.http
      .post<{ success: boolean; updatedStock: number; message: string }>(
        `${this.urlAPI}cart-details/remove/${encodeURIComponent(email)}`,
        {
          recordId: recordId,
          amount: amount,
        },
        { headers }
      )
      .pipe(
        tap((response) => {
          if (
            response &&
            response.success &&
            response.updatedStock !== undefined
          ) {
            // Use the updatedStock from the response instead of making another API call
            this.stockService.notifyStockUpdate(
              recordId,
              response.updatedStock
            );

            // Return the updated record with the new stock value
            return {
              id: recordId,
              stock: response.updatedStock,
              amount: amount,
              success: true,
              message: response.message,
            };
          } else {
            console.error(
              "[CartDetailService] Invalid response format:",
              response
            );
            return throwError(
              () =>
                new Error(
                  response?.message || "Failed to remove item from cart"
                )
            );
          }
        }),
        catchError((error) => {
          console.error(
            "[CartDetailService] Error in removeFromCartDetail:",
            error
          );
          return throwError(() => error);
        })
      );
  }

  addAmountCartDetail(detail: ICartDetail): Observable<ICartDetail> {
    return this.http.put<ICartDetail>(
      `${this.urlAPI}cart-details/${detail.IdCartDetail}`,
      detail
    );
  }

  updateRecordStock(recordId: number, change: number): Observable<IRecord> {
    if (typeof change !== "number" || isNaN(change)) {
      return throwError(() => new Error("Invalid stock change value"));
    }

    return this.http
      .put<any>(
        `${this.urlAPI}records/${recordId}/stock/${change}`,
        {},
        { headers: this.getHeaders() }
      )
      .pipe(
        tap((response) => {
          const newStock = response?.newStock;
          if (typeof newStock === "number" && newStock >= 0) {
            this.stockService.notifyStockUpdate(recordId, newStock);
          } else {
            throw new Error("Received invalid stock value from server");
          }
        }),
        map(
          (response) =>
            ({
              IdRecord: recordId,
              stock: response.newStock,
              TitleRecord: "",
              YearOfPublication: null,
              ImageRecord: null,
              Photo: null,
              Price: 0,
              Discontinued: false,
              GroupId: null,
              GroupName: "",
              NameGroup: "",
            } as IRecord)
        ),
        catchError((error) => {
          return throwError(
            () => new Error("Failed to update stock. Please try again.")
          );
        })
      );
  }

  getHeaders(): HttpHeaders {
    const token = this.authGuard.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return headers;
  }

  incrementQuantity(detail: ICartDetail): Observable<ICartDetail> {
    const previousAmount = detail.Amount;
    detail.Amount++;
    return new Observable((observer) => {
      this.addAmountCartDetail(detail).subscribe({
        next: () => {
          this.updateRecordStock(detail.RecordId, -1).subscribe({
            next: () => {
              observer.next(detail);
              observer.complete();
            },
            error: (err) => {
              detail.Amount = previousAmount;
              observer.error(err);
            },
          });
        },
        error: (err) => {
          detail.Amount = previousAmount;
          observer.error(err);
        },
      });
    });
  }

  decrementQuantity(detail: ICartDetail): Observable<ICartDetail> {
    if (detail.Amount <= 1) {
      // Do not allow quantities less than 1
      return of(detail); // Return the detail without changes
    }
    const previousAmount = detail.Amount;
    detail.Amount--;
    return new Observable((observer) => {
      this.addAmountCartDetail(detail).subscribe({
        next: () => {
          this.updateRecordStock(detail.RecordId, 1).subscribe({
            next: () => {
              observer.next(detail);
              observer.complete();
            },
            error: (err) => {
              detail.Amount = previousAmount;
              observer.error(err);
            },
          });
        },
        error: (err) => {
          detail.Amount = previousAmount;
          observer.error(err);
        },
      });
    });
  }

  getCartDetailsByEmail(email: string): Observable<ICartDetail[]> {
    const url = `${this.urlAPI}cart-details/${encodeURIComponent(email)}`;

    const headers = this.getHeaders();

    return this.http.get<ICartDetail[]>(url, { headers }).pipe(
      catchError((error) => {
        console.error("Error in getCartDetailsByEmail:", error);
        return throwError(() => error);
      })
    );
  }
}
