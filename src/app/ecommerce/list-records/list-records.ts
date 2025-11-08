import {
  Component,
  OnInit,
  ViewChild,
  afterNextRender,
  ElementRef,
  inject,
  DestroyRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { of, throwError } from "rxjs";
import { finalize, switchMap, map, catchError } from "rxjs/operators";

// PrimeNG
import { ConfirmationService, MessageService } from "primeng/api";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { DialogModule } from "primeng/dialog";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { TooltipModule } from "primeng/tooltip";
import { MessageModule } from "primeng/message";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { TableModule } from "primeng/table";
import { InputNumberModule } from "primeng/inputnumber";

// Components
import { NavbarComponent } from "src/app/shared/navbar/navbar";

// Services
import { IRecord } from "../ecommerce.interface";
import { RecordsService } from "../services/records";
import { GroupsService } from "../services/groups";
import { CartService } from "../services/cart";
import { UserService } from "src/app/services/user";
import { StockService } from "../services/stock";
import { AuthGuard } from "src/app/guards/auth-guard";

@Component({
  selector: "app-listrecords",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    ConfirmDialogModule,
    TableModule,
    TooltipModule,
    MessageModule,
    ProgressSpinnerModule,
    InputNumberModule,
  ],
  templateUrl: "./list-records.html",
  providers: [ConfirmationService, MessageService],
})
export class ListrecordsComponent implements OnInit {
  @ViewChild(NavbarComponent, { static: false }) navbar!: NavbarComponent;
  records: IRecord[] = [];
  filteredRecords: IRecord[] = [];
  searchText: string = "";
  cart: IRecord[] = [];
  groupId: string | null = null;
  groupName: string = "";
  errorMessage: string = "";
  visibleError: boolean = false;
  visiblePhoto: boolean = false;
  photo: string = "";
  cartItemsCount: number = 0;
  isAddingToCart = false;
  loading: boolean = false;
  cartEnabled = true; // Initialize as true by default
  private readonly destroyRef = inject(DestroyRef);

  record: IRecord = {
    IdRecord: 0,
    TitleRecord: "",
    YearOfPublication: null,
    ImageRecord: null,
    Photo: null,
    PhotoName: null,
    Price: 0,
    stock: 0,
    Discontinued: false,
    GroupId: null,
    GroupName: "",
    NameGroup: "",
  };
  userEmail: string | null = null;
  @ViewChild("recordsContainer") recordsContainer!: ElementRef<HTMLElement>;
  // Services injected using inject()
  private readonly recordsService = inject(RecordsService);
  private readonly groupsService = inject(GroupsService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly cartService = inject(CartService);
  private readonly userService = inject(UserService);
  private readonly stockService = inject(StockService);
  private readonly authGuard = inject(AuthGuard);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    // Setup afterNextRender for visual updates
    afterNextRender(() => {
      this.updateListVisuals();
    });
  }

  ngAfterViewInit(): void {
    this.initializeList();
    this.setupIntersectionObserver();
  }

  ngOnInit(): void {
    // Initialize cart status first
    this.cartEnabled = true; // Default to enabled while checking

    // Only configure subscriptions if the user is authenticated
    if (this.authGuard.isLoggedIn()) {
      this.userEmail = this.authGuard.getUser();
      this.setupSubscriptions();
      this.checkCartStatus();
    } else {
      this.cartService.cartEnabledSubject.next(false);
    }

    // Load records after setting up cart status
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params: ParamMap) => {
        const idGroup = params.get("idGroup");
        if (idGroup) {
          this.groupId = idGroup;
          this.loadRecords(idGroup);
        } else {
          this.errorMessage = "No group ID provided";
          this.visibleError = true;
        }
      });
  }

  checkCartStatus() {
    if (!this.userEmail) {
      console.log("No user email, disabling cart");
      this.cartService.cartEnabledSubject.next(false);
      return;
    }

    this.cartService.getCartStatus(this.userEmail).subscribe({
      next: (status: { enabled: boolean }) => {
        this.cartService.cartEnabledSubject.next(status.enabled);
      },
      error: (error: any) => {
        console.error("Error checking cart status:", error);
        // Default to enabled if there's an error
        this.cartService.cartEnabledSubject.next(true);
      },
    });
  }

  private setupSubscriptions(): void {
    // Subscribe to cart enabled state
    this.cartService.cartEnabled$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (enabled) => {
          this.cartEnabled = enabled !== false; // Only set to false if explicitly false
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error("Error in cart enabled subscription:", error);
          this.cartEnabled = true; // Default to enabled on error
          this.cdr.detectChanges();
        },
      });

    // Subscribe to cart changes
    this.cartService.cart$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cartItems) => {
        // Update cart status for all records
        [this.records, this.filteredRecords].forEach((recordArray) => {
          recordArray.forEach((record) => {
            const cartItem = cartItems.find(
              (item: IRecord) => item.IdRecord === record.IdRecord
            );
            if (cartItem) {
              record.Amount = cartItem.Amount || 0;
              record.inCart = true;
            } else {
              record.Amount = 0;
              record.inCart = false;
            }
          });
        });
        this.cdr.detectChanges();
      });

    // Initial cart sync if user is logged in
    if (this.userEmail) {
      this.cartService.syncCartWithBackend(this.userEmail);
    }

    // Subscribe to stock updates
    this.stockService.stockUpdate$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ recordId, newStock }) => {
        // The stock service already validates the value, so we can trust it here
        [this.records, this.filteredRecords].forEach((recordArray) => {
          const record = recordArray.find((r) => r.IdRecord === recordId);
          if (record) {
            record.stock = newStock;
            // Trigger change detection
            this.cdr.detectChanges();
          }
        });
      });

    // Subscribe to cart item count
    this.cartService.cartItemCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (count) => {
          this.cartItemsCount = count;
        },
        error: (error) => {
          console.error("Error in cart item count subscription:", error);
        },
      });

    // Subscribe to user email changes
    this.userService.emailUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (email) => {
          this.userEmail = email;
        },
        error: (error) => {
          console.error("Error in email subscription:", error);
        },
      });
  }

  confirm(): void {
    this.confirmationService.confirm({
      message: "Are you sure you want to continue?",
      accept: () => {},
    });
  }

  isLoggedIn(): boolean {
    return !!sessionStorage.getItem("user");
  }

  loadRecords(idGroup: string): void {
    this.loading = true;
    this.errorMessage = "";
    this.visibleError = false;

    // First we synchronize the cart with the backend
    if (this.userEmail) {
      this.cartService.syncCartWithBackend(this.userEmail);
    }

    this.recordsService
      .getRecordsByGroup(idGroup)
      .pipe(
        switchMap((records: IRecord[]) => {
          if (!records || records.length === 0) {
            this.errorMessage = "No records found for this group";
            this.visibleError = true;
            return of([]);
          }

          this.records = records;
          // Get cart items to sync cart status
          return this.cartService.getCartItems().pipe(
            map((cartItems: IRecord[]) => {
              // Update cart status for each record
              this.records.forEach((record) => {
                const cartItem = cartItems.find(
                  (item) => item.IdRecord === record.IdRecord
                );
                if (cartItem) {
                  record.inCart = true;
                  record.Amount = cartItem.Amount;
                } else {
                  record.inCart = false;
                  record.Amount = 0;
                }
              });
              return this.records;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (records: IRecord[]) => {
          this.getGroupName(idGroup);
          this.filterRecords();
          this.cdr.detectChanges();
        },
        error: (error: any) => {
          console.error("Error loading records:", error);
          this.errorMessage = "Error loading records";
          this.visibleError = true;
          this.cdr.detectChanges();
        },
      });
  }

  getGroupName(idGroup: string): void {
    this.groupsService
      .getGroupName(idGroup)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (nameGroup: string) => {
          this.groupName = nameGroup;
          this.cdr.detectChanges();
        },
        error: (error: any) => {
          console.error("Error loading group name:", error);
          this.errorMessage = "Error loading group name";
          this.visibleError = true;
          this.cdr.detectChanges();
        },
      });
  }

  filterRecords(): void {
    if (!this.searchText) {
      this.filteredRecords = [...this.records];
    } else {
      this.filteredRecords = this.records.filter((record) => {
        return (
          record.GroupName.toLowerCase().includes(
            this.searchText.toLowerCase()
          ) ||
          record.TitleRecord.toLowerCase().includes(
            this.searchText.toLowerCase()
          ) ||
          (record.YearOfPublication
            ? record.YearOfPublication.toString().includes(this.searchText)
            : false)
        );
      });
    }
  }

  onSearchChange(): void {
    this.filterRecords();
  }

  showImage(record: IRecord): void {
    if (this.visiblePhoto && this.record === record) {
      this.visiblePhoto = false;
    } else {
      this.record = record;
      this.photo = record.ImageRecord!;
      this.visiblePhoto = true;
    }
  }

  addToCart(record: IRecord): void {
    if (this.isAddingToCart || !record.stock || record.stock <= 0) {
      return;
    }

    this.isAddingToCart = true;
    this.errorMessage = "";
    this.visibleError = false;

    this.cartService
      .addToCart(record)
      .pipe(finalize(() => (this.isAddingToCart = false)))
      .subscribe({
        next: (updatedRecord: any) => {
          // Update the local record state
          const existingRecord = this.records.find(
            (r) => r.IdRecord === record.IdRecord
          );
          if (existingRecord) {
            existingRecord.inCart = true;
            existingRecord.Amount = (existingRecord.Amount || 0) + 1;
            existingRecord.stock = updatedRecord?.stock || record.stock;
            // Update filtered records
            const filteredRecord = this.filteredRecords.find(
              (r) => r.IdRecord === record.IdRecord
            );
            if (filteredRecord) {
              filteredRecord.inCart = true;
              filteredRecord.Amount = existingRecord.Amount;
              filteredRecord.stock = existingRecord.stock;
            }
            this.cdr.detectChanges();
          }
        },
        error: (error: any) => {
          this.errorMessage = error.message || "Error adding to cart";
          this.visibleError = true;
          console.error("Error adding:", error);
        },
      });
  }

  removeRecord(record: IRecord): void {
    if (!record.Amount || this.isAddingToCart) return;
    this.isAddingToCart = true;
    const prevAmount = record.Amount;
    record.Amount = Math.max(0, prevAmount - 1);

    this.cartService
      .removeFromCart(record)
      .pipe(
        finalize(() => {
          this.isAddingToCart = false;
        }),
        catchError((error) => {
          // Revert local changes
          record.Amount = prevAmount;
          return throwError(error);
        })
      )
      .subscribe({
        next: (updatedRecord: any) => {
          // Update the local record state
          const existingRecord = this.records.find(
            (r) => r.IdRecord === record.IdRecord
          );
          if (existingRecord) {
            const currentAmount = existingRecord.Amount || 0;
            existingRecord.Amount = Math.max(0, currentAmount - 1);
            existingRecord.inCart = existingRecord.Amount > 0;
            existingRecord.stock = updatedRecord?.stock || record.stock;

            // Update filtered records
            const filteredRecord = this.filteredRecords.find(
              (r) => r.IdRecord === record.IdRecord
            );
            if (filteredRecord) {
              filteredRecord.Amount = existingRecord.Amount;
              filteredRecord.inCart = existingRecord.inCart;
              filteredRecord.stock = existingRecord.stock;
            }

            this.cdr.detectChanges();
          }

          // Update cart status
          if (this.userEmail) {
            this.cartService.syncCartWithBackend(this.userEmail);
          }
        },
        error: (error: any) => {
          console.error("Error deleting item from cart:", error);
          this.errorMessage = "Error deleting item from cart";
          this.visibleError = true;
        },
      });
  }

  ngOnDestroy(): void {}

  private initializeList(): void {
    // Configure custom events for list items
    const recordItems = document.querySelectorAll(".record-item");
    recordItems.forEach((item) => {
      item.addEventListener("mouseenter", () => {
        item.classList.add("hovered");
      });
      item.addEventListener("mouseleave", () => {
        item.classList.remove("hovered");
      });
    });
  }

  private setupIntersectionObserver(): void {
    const options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Load more records when the user reaches the end
          console.log("Visible element:", entry.target);
          // Here you could implement loading more records
        }
      });
    }, options);

    // Observe the last element of the list
    const lastItem = document.querySelector(".record-item:last-child");
    if (lastItem) {
      observer.observe(lastItem);
    }
  }

  private updateListVisuals(): void {
    // Update styles based on the state
    const recordItems = document.querySelectorAll(".record-item");
    recordItems.forEach((item, index) => {
      // Example: Apply styles based on position or state
      if (index % 2 === 0) {
        item.classList.add("even");
        item.classList.remove("odd");
      } else {
        item.classList.add("odd");
        item.classList.remove("even");
      }

      // Update styles based on stock
      const stockBadge = item.querySelector(".stock-badge");
      if (stockBadge) {
        const stockText = stockBadge.textContent || "";
        const stockValue = parseInt(stockText, 10) || 0;

        if (stockValue <= 0) {
          stockBadge.classList.add("out-of-stock");
          stockBadge.classList.remove("low-stock", "in-stock");
        } else if (stockValue < 5) {
          stockBadge.classList.add("low-stock");
          stockBadge.classList.remove("out-of-stock", "in-stock");
        } else {
          stockBadge.classList.add("in-stock");
          stockBadge.classList.remove("out-of-stock", "low-stock");
        }
      }
    });
  }

  isAdmin(): boolean {
    return this.authGuard.isAdmin();
  }

  isAddButtonDisabled(record: IRecord): boolean {
    if (!record) return true;

    const amount = record.Amount || 0;
    const inCart = record.inCart || false;
    const hasStock = (record.stock || 0) > 0;
    const reachedMax = inCart && amount >= (record.stock || 0);

    // Only disable if cart is explicitly disabled (false), not if it's undefined
    const cartDisabled = this.cartEnabled === false;

    const disabled =
      !this.isLoggedIn() ||
      cartDisabled ||
      !hasStock ||
      this.isAddingToCart ||
      reachedMax;

    // Detailed debug information
    const debugInfo = {
      recordId: record.IdRecord,
      title: record.TitleRecord,
      stock: record.stock,
      inCart: inCart,
      amount: amount,
      hasStock: hasStock,
      reachedMax: reachedMax,
      isLoggedIn: this.isLoggedIn(),
      cartEnabled: this.cartEnabled,
      isAddingToCart: this.isAddingToCart,
      disabled: disabled,
      disabledReason: !this.isLoggedIn()
        ? "Not logged in"
        : cartDisabled
        ? "Cart disabled"
        : !hasStock
        ? "No stock"
        : this.isAddingToCart
        ? "Adding to cart..."
        : reachedMax
        ? "Max quantity reached"
        : "Button should be enabled",
    };

    console.log("Add button debug:", debugInfo);

    return disabled;
  }

  logButtonState(record: IRecord, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
  }

  onAddToCart(event: Event, record: IRecord): void {
    event.stopPropagation();
    this.logButtonState(record);
    this.addToCart(record);
  }
}
