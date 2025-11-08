import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { environment } from "src/environments/environment";
import { catchError, map, Observable, of, tap } from "rxjs";
import { IOrder, IOrderDetail } from "../ecommerce.interface";
import { AuthGuard } from "src/app/guards/auth-guard";

@Injectable({
  providedIn: "root",
})
export class OrderService {
  urlAPI = environment.urlAPI;

  constructor(private http: HttpClient, private authGuard: AuthGuard) {}

  private getHeaders(): HttpHeaders {
    const token = this.authGuard.getToken();
    return new HttpHeaders({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
  }

  createOrderFromCart(
    userEmail: string,
    paymentMethod: string
  ): Observable<IOrder> {
    const headers = this.getHeaders();
    return this.http.post<IOrder>(
      `${this.urlAPI}orders/create/${encodeURIComponent(userEmail)}`,
      { paymentMethod },
      { headers }
    );
  }

  getAllOrders(): Observable<IOrder[]> {
    return this.http
      .get<any>(`${this.urlAPI}orders`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((response: any) => {
          // Check if response has the expected structure with data array
          if (response && response.success && Array.isArray(response.data)) {
            return response.data.map((order: any) =>
              this.normalizeOrder(order)
            );
          }

          // Fallback: check if response is directly an array
          if (Array.isArray(response)) {
            console.log(`Found ${response.length} orders in direct response`);
            return response.map((order: any) => this.normalizeOrder(order));
          }

          console.warn("Unexpected response format:", response);
          return [];
        }),
        catchError((error) => {
          console.error("Error loading all orders:", error);
          return of([]);
        })
      );
  }

  getOrdersByUserEmail(email: string): Observable<IOrder[]> {
    return this.http
      .get<{ success: boolean; data: any[]; message?: string }>(
        `${this.urlAPI}orders/${encodeURIComponent(email)}`,
        {
          headers: this.getHeaders(),
        }
      )
      .pipe(
        map((response) => {
          const orders = response?.data || [];
          if (!Array.isArray(orders)) {
            console.warn("Expected orders to be an array, got:", typeof orders);
            return [];
          }
          return orders.map((order: any) => this.normalizeOrder(order));
        }),
        catchError((error) => {
          console.error("Error processing orders:", error);
          return of([]);
        })
      );
  }

  private normalizeOrder(order: any): IOrder {
    if (!order) {
      console.warn("normalizeOrder called with null/undefined order");
      return this.getEmptyOrder();
    }

    try {
      // Handle both OrderDetails (from backend) and orderDetails (frontend expected)
      const details = order.OrderDetails || order.orderDetails || [];

      if (!Array.isArray(details)) {
        console.warn("Order details is not an array:", details);
      }

      const normalizedDetails = Array.isArray(details)
        ? details.map((detail, index) => {
            const normalized = this.normalizeOrderDetail(detail);
            if (!normalized.IdOrderDetail) {
              console.warn(`Order detail at index ${index} has no ID:`, detail);
            }
            return normalized;
          })
        : [];

      const normalizedOrder: IOrder = {
        IdOrder: order.IdOrder || 0,
        OrderDate: order.OrderDate
          ? new Date(order.OrderDate).toISOString()
          : new Date().toISOString(),
        PaymentMethod: order.PaymentMethod || "Unknown",
        Total: order.Total || 0,
        UserEmail: order.UserEmail || "",
        CartId: order.CartId || 0,
        OrderDetails: normalizedDetails,
      };

      return normalizedOrder;
    } catch (error) {
      console.error("Error normalizing order:", error, "Order data:", order);
      return this.getEmptyOrder();
    }
  }

  private normalizeOrderDetail(detail: any): IOrderDetail {
    if (!detail) {
      return this.getEmptyOrderDetail();
    }

    // Handle both camelCase and PascalCase property names
    const id = detail.idOrderDetail || detail.IdOrderDetail || 0;
    const orderId = detail.orderId || detail.OrderId || 0;
    const recordId = detail.recordId || detail.RecordId || 0;
    const amount = detail.amount || detail.Amount || 0;
    const price = detail.price || detail.Price || 0;
    const total = detail.total || detail.Total || amount * price;
    const recordTitle =
      detail.recordTitle ||
      detail.RecordTitle ||
      `Record ${recordId || "Unknown"}`;

    return {
      IdOrderDetail: id,
      OrderId: orderId,
      RecordId: recordId,
      RecordTitle: recordTitle,
      Amount: amount,
      Price: price,
      Total: total,
    };
  }

  private getEmptyOrder(): IOrder {
    return {
      IdOrder: 0,
      OrderDate: new Date().toISOString(),
      PaymentMethod: "",
      Total: 0,
      UserEmail: "",
      CartId: 0,
      OrderDetails: [],
    };
  }

  private getEmptyOrderDetail(): IOrderDetail {
    return {
      IdOrderDetail: 0,
      OrderId: 0,
      RecordId: 0,
      RecordTitle: "Unknown Record",
      Amount: 0,
      Price: 0,
      Total: 0,
    };
  }
}
