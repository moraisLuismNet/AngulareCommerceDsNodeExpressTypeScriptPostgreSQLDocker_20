import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  AfterViewInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subject, of, forkJoin } from "rxjs";
import { takeUntil, filter, map, catchError, switchMap } from "rxjs/operators";

// PrimeNG
import { ButtonModule } from "primeng/button";
import { InputNumberModule } from "primeng/inputnumber";
import { TableModule } from "primeng/table";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { MessageModule } from "primeng/message";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { DialogModule } from "primeng/dialog";
import { ConfirmationService, MessageService } from "primeng/api";

// Services & Interfaces
import {
  ICartDetail,
  IRecord,
  IGroup,
  GroupResponse,
  ExtendedCartDetail,
} from "../ecommerce.interface";
import { UserService } from "src/app/services/user";
import { CartDetailService } from "../services/cart-detail";
import { CartService } from "src/app/ecommerce/services/cart";
import { OrderService } from "../services/order";
import { GroupsService } from "../services/groups";

@Component({
  selector: "app-cart-details",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    TableModule,
    ProgressSpinnerModule,
    MessageModule,
    ConfirmDialogModule,
    DialogModule,
  ],
  templateUrl: "./cart-details.html",
  styleUrls: ["./cart-details.css"],
  providers: [ConfirmationService, MessageService],
})
export class CartDetailsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild("cartContainer") cartContainer!: ElementRef;

  cartDetails: ICartDetail[] = [];
  filteredCartDetails: ExtendedCartDetail[] = [];
  emailUser: string | null = "";
  isAddingToCart = false;
  private readonly destroy$ = new Subject<void>();
  currentViewedEmail: string = "";
  isViewingAsAdmin: boolean = false;
  isCreatingOrder = false;
  alertMessage: string = "";
  alertType: "success" | "error" | null = null;
  loading = false;
  visibleError = false;
  errorMessage = "";

  // State for scrolling
  private lastScrollPosition: number = 0;

  private readonly cdr = inject(ChangeDetectorRef);
  private handleScrollBound: (event: Event) => void;

  constructor(
    private readonly cartDetailService: CartDetailService,
    private readonly route: ActivatedRoute,
    private readonly userService: UserService,
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
    private readonly groupsService: GroupsService
  ) {
    // Bind the handleScroll method to maintain the correct 'this' context
    this.handleScrollBound = this.handleScroll.bind(this);
  }

  ngAfterViewInit(): void {
    // Initialize after the view is initialized
  }

  ngOnInit(): void {
    // Initialize scroll tracking
    this.initializeScrollTracking();

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const viewingUserEmail = params["viewingUserEmail"];

        if (viewingUserEmail && this.userService.isAdmin()) {
          // Admin
          this.isViewingAsAdmin =
            viewingUserEmail && this.userService.isAdmin();
          this.currentViewedEmail = viewingUserEmail;
          this.isViewingAsAdmin = true;
          this.loadCartDetails(viewingUserEmail);
        } else {
          // User viewing their own cart
          this.userService.email$
            .pipe(
              takeUntil(this.destroy$),
              filter((email): email is string => !!email)
            )
            .subscribe((email) => {
              this.currentViewedEmail = email;
              this.isViewingAsAdmin = false;
              this.loadCartDetails(email);
            });
        }
      });
  }

  private loadCartDetails(email: string): void {
    this.cartDetailService
      .getCartDetailsByEmail(email)
      .pipe(
        takeUntil(this.destroy$),
        map((response: any) => {
          // If you are an admin or do not have a cart, the response will be an empty array.
          if (Array.isArray(response)) {
            return response;
          }

          // Handle backend response format
          const processedResponse = response?.$values || response?.Items || [];
          return processedResponse;
        }),
        catchError((error) => {
          console.error("Error loading cart details:", error);
          console.error("Error details:", {
            status: error.status,
            message: error.message,
            error: error.error,
          });
          return of([]); // Always return empty array on errors
        })
      )
      .subscribe({
        next: (details) => {
          this.cartDetails = details;

          this.filteredCartDetails = this.getFilteredCartDetails();

          this.cdr.detectChanges();
          this.loadRecordDetails();
        },
        error: (error) => {
          console.error("Error in cart details subscription:", error);
        },
      });
  }

  private loadRecordDetails(): void {
    // First we get all the groups to have the names
    this.groupsService
      .getGroups()
      .pipe(
        takeUntil(this.destroy$),
        switchMap((groupsResponse: IGroup[] | GroupResponse) => {
          // Convert the response to an array of groups
          const groups = Array.isArray(groupsResponse)
            ? groupsResponse
            : (groupsResponse as GroupResponse)?.$values || [];

          // Create a map of groupId to groupName for quick search
          const groupMap = new Map<number, string>();
          groups.forEach((group: IGroup) => {
            if (group?.IdGroup) {
              groupMap.set(group.IdGroup, group.NameGroup || "");
            }
          });

          // For each detail in the cart, get the record details and assign the groupName
          const recordDetails$ = this.filteredCartDetails.map((detail) =>
            this.cartDetailService.getRecordDetails(detail.RecordId).pipe(
              filter((record): record is IRecord => record !== null),
              map((record) => ({
                detail,
                record,
                groupName: record.GroupId
                  ? groupMap.get(record.GroupId) || ""
                  : "",
              }))
            )
          );

          return forkJoin(recordDetails$);
        })
      )
      .subscribe((results) => {
        results.forEach(({ detail, record, groupName }) => {
          const index = this.filteredCartDetails.findIndex(
            (d) => d.RecordId === detail.RecordId
          );

          if (index !== -1) {
            // Get stock from record.data.stock or record.stock
            const stockValue = record?.data?.stock ?? record?.stock;

            const updatedDetail = {
              ...this.filteredCartDetails[index],
              stock: stockValue,
              groupName: groupName || record.GroupName || "",
              titleRecord:
                record.TitleRecord ||
                this.filteredCartDetails[index].TitleRecord,
              price: record.Price || this.filteredCartDetails[index].Price,
            } as ExtendedCartDetail;

            this.filteredCartDetails[index] = updatedDetail;
          }
        });

        // Force view refresh
        this.filteredCartDetails = [...this.filteredCartDetails];
        this.cdr.detectChanges();
      });
  }

  private getFilteredCartDetails(): ExtendedCartDetail[] {
    if (!Array.isArray(this.cartDetails)) return [];

    return this.cartDetails
      .filter((detail): detail is ICartDetail => {
        const amount = detail.amount ?? detail.Amount;
        const recordId = detail.recordId ?? detail.RecordId;
        const cartId = detail.cartId ?? detail.CartId;

        return (
          detail &&
          typeof amount === "number" &&
          amount > 0 &&
          typeof recordId === "number" &&
          typeof cartId === "number"
        );
      })
      .map((detail) => {
        const amount = detail.amount ?? detail.Amount ?? 0;
        const price = detail.price ?? detail.Price ?? 0;
        const titleRecord =
          detail.titleRecord ?? detail.TitleRecord ?? detail.RecordTitle ?? "";
        const groupName = detail.groupName ?? detail.GroupName ?? "";
        const imageRecord =
          detail.imageRecord ??
          detail.imageRecord ??
          detail.Record?.ImageRecord ??
          "";
        const total = detail.total ?? detail.Total ?? price * amount;
        const recordId = detail.recordId ?? detail.RecordId;
        const cartId = detail.cartId ?? detail.CartId;

        return {
          ...detail,
          idCartDetail: detail.idCartDetail ?? detail.IdCartDetail,
          recordId,
          cartId,
          amount,
          price,
          total,
          titleRecord,
          groupName,
          imageRecord,
          // Keep original properties for backward compatibility
          IdCartDetail: detail.IdCartDetail ?? detail.idCartDetail,
          RecordId: recordId,
          CartId: cartId,
          Amount: amount,
          Price: price,
          Total: total,
          TitleRecord: titleRecord,
          GroupName: groupName,
          ImageRecord: imageRecord,
        } as ExtendedCartDetail;
      });
  }

  async addToCart(detail: ICartDetail): Promise<void> {
    if (!this.currentViewedEmail || this.isAddingToCart) return;

    this.isAddingToCart = true;
    this.clearAlert();

    try {
      const updatedDetail = await this.cartDetailService
        .addToCartDetail(this.currentViewedEmail, detail.RecordId, 1)
        .toPromise();

      // Update UI locally first for better user experience
      const itemIndex = this.filteredCartDetails.findIndex(
        (d) => d.RecordId === detail.RecordId
      );
      if (itemIndex !== -1) {
        const updatedItem = {
          ...this.filteredCartDetails[itemIndex],
          Amount: (this.filteredCartDetails[itemIndex].Amount || 0) + 1,
          stock:
            updatedDetail?.stock || this.filteredCartDetails[itemIndex].stock,
        };
        this.filteredCartDetails[itemIndex] = updatedItem;
        this.updateCartTotals();
      }

      // Refresh data from the server
      await this.loadCartDetails(this.currentViewedEmail);

      // Update the stock value in the UI
      const updatedRecord = await this.cartDetailService
        .getRecordDetails(detail.RecordId)
        .toPromise();
      if (updatedRecord) {
        const stockIndex = this.filteredCartDetails.findIndex(
          (d) => d.RecordId === detail.RecordId
        );
        if (stockIndex !== -1) {
          this.filteredCartDetails[stockIndex].stock = updatedRecord.stock;
        }
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      // Revert local changes if it fails
      const itemIndex = this.filteredCartDetails.findIndex(
        (d) => d.RecordId === detail.RecordId
      );
      if (itemIndex !== -1) {
        this.filteredCartDetails[itemIndex].Amount -= 1;
        this.updateCartTotals();
      }
    } finally {
      this.isAddingToCart = false;
    }
  }

  async removeRecord(detail: ICartDetail): Promise<void> {
    if (!this.currentViewedEmail || detail.Amount <= 0) return;

    try {
      await this.cartDetailService
        .removeFromCartDetail(this.currentViewedEmail, detail.RecordId, 1)
        .toPromise();

      // Update UI locally first for better user experience
      const itemIndex = this.filteredCartDetails.findIndex(
        (d) => d.RecordId === detail.RecordId
      );
      if (itemIndex !== -1) {
        const updatedItem = {
          ...this.filteredCartDetails[itemIndex],
          Amount: Math.max(
            0,
            (this.filteredCartDetails[itemIndex].Amount || 0) - 1
          ),
        };
        this.filteredCartDetails[itemIndex] = updatedItem;
        this.updateCartTotals();
      }

      // Refresh data from the server
      await this.loadCartDetails(this.currentViewedEmail);

      // Update the stock value in the UI
      const updatedRecord = await this.cartDetailService
        .getRecordDetails(detail.RecordId)
        .toPromise();
      if (updatedRecord) {
        const stockIndex = this.filteredCartDetails.findIndex(
          (d) => d.RecordId === detail.RecordId
        );
        if (stockIndex !== -1) {
          this.filteredCartDetails[stockIndex].stock = updatedRecord.stock;
        }
      }

      this.showAlert("Product removed from cart", "success");
    } catch (error) {
      console.error("Error removing from cart:", error);
      this.showAlert("Failed to remove product from cart", "error");
      // Revert local changes if it fails
      const itemIndex = this.filteredCartDetails.findIndex(
        (d) => d.RecordId === detail.RecordId
      );
      if (itemIndex !== -1) {
        this.filteredCartDetails[itemIndex].Amount += 1;
        this.updateCartTotals();
      }
    }
  }

  private updateCartTotals(): void {
    const totalItems = this.filteredCartDetails.reduce(
      (sum, d) => sum + d.Amount,
      0
    );
    const totalPrice = this.filteredCartDetails.reduce(
      (sum, d) => sum + (d.Price || 0) * d.Amount,
      0
    );
    this.cartService.updateCartNavbar(totalItems, totalPrice);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up any scroll listeners
    if (this.handleScrollBound) {
      window.removeEventListener("scroll", this.handleScrollBound);
    }
  }

  private initializeScrollTracking(): void {
    if (this.cartContainer && this.cartContainer.nativeElement) {
      // Save initial scroll position
      this.lastScrollPosition = window.scrollY;

      // Add a listener for the scroll event
      window.addEventListener("scroll", this.handleScrollBound, {
        passive: true,
      });
    }
  }

  private handleScroll = (): void => {
    const currentScroll = window.scrollY;
    const cartElement = this.cartContainer?.nativeElement;

    if (cartElement) {
      // Hide/show elements based on scroll position
      if (currentScroll > 100 && currentScroll > this.lastScrollPosition) {
        // Scrolling down
        cartElement.classList.add("scrolling-down");
      } else {
        cartElement.classList.remove("scrolling-down");
      }

      this.lastScrollPosition = currentScroll;
    }
  };

  async createOrder(): Promise<void> {
    if (!this.currentViewedEmail || this.isViewingAsAdmin) return;

    this.isCreatingOrder = true;
    this.clearAlert();

    try {
      const paymentMethod = "credit-card";
      const order = await this.orderService
        .createOrderFromCart(this.currentViewedEmail, paymentMethod)
        .toPromise();

      this.showAlert("Order created successfully", "success");
      this.loadCartDetails(this.currentViewedEmail);
      this.cartService.updateCartNavbar(0, 0);
    } catch (error: any) {
      console.error("Full error:", error);
      const errorMsg = error.error?.message || "Failed to create order";
      this.showAlert(errorMsg, "error");
    } finally {
      this.isCreatingOrder = false;
    }
  }

  private showAlert(message: string, type: "success" | "error"): void {
    this.alertMessage = message;
    this.alertType = type;

    // Hide the message after 5 seconds
    setTimeout(() => this.clearAlert(), 5000);
  }

  private clearAlert(): void {
    this.alertMessage = "";
    this.alertType = null;
  }

  shouldDisableAddButton(detail: any): boolean {
    // Check if we're in the process of adding to cart
    if (this.isAddingToCart) {
      return true;
    }

    // Check stock in all possible locations
    const stock =
      detail.record?.data?.stock ?? detail.record?.stock ?? detail.stock;

    // If stock is undefined, don't disable the button
    if (stock === undefined || stock === null) {
      return false;
    }

    // Convert to number and check if it's 0 or less
    const stockNumber = Number(stock);
    const shouldDisable = !isNaN(stockNumber) && stockNumber <= 0;

    return shouldDisable;
  }

  isAddButtonDisabled(detail: any): boolean {
    // Check if we're in the process of adding to cart
    if (this.isAddingToCart) {
      return true;
    }

    // Function to check stock
    const checkStock = (value: any): boolean => {
      // Convert to number and check if it's 0 or less
      const numValue = Number(value);
      return !isNaN(numValue) && numValue <= 0;
    };

    // Check stock in record.data.stock
    if (detail.record?.data?.stock !== undefined) {
      const shouldDisable = checkStock(detail.record.data.stock);
      console.log(
        "Stock from record.data.stock:",
        detail.record.data.stock,
        "Disable:",
        shouldDisable
      );
      return shouldDisable;
    }

    // Check stock in record.stock
    if (detail.record?.stock !== undefined) {
      const shouldDisable = checkStock(detail.record.stock);
      console.log(
        "Stock from record.stock:",
        detail.record.stock,
        "Disable:",
        shouldDisable
      );
      return shouldDisable;
    }

    // Check stock in detail.stock
    if (detail.stock !== undefined) {
      const shouldDisable = checkStock(detail.stock);
      console.log(
        "Stock from detail.stock:",
        detail.stock,
        "Disable:",
        shouldDisable
      );
      return shouldDisable;
    }

    // If no stock information is found, enable the button
    console.log("No stock information found, enabling button");
    return false;
  }
}
