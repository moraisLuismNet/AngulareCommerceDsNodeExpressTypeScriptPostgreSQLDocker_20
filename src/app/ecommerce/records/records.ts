import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  afterNextRender,
  inject,
  DestroyRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  //environment
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, NgForm } from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

// PrimeNG
import { ConfirmationService, MessageService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { DialogModule } from "primeng/dialog";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { FileUploadModule } from "primeng/fileupload";
import { TooltipModule } from "primeng/tooltip";

// Services
import { IRecord } from "../ecommerce.interface";
import { RecordsService } from "../services/records";
import { GroupsService } from "../services/groups";
import { StockService } from "../services/stock";
import { CartService } from "../services/cart";
import { UserService } from "src/app/services/user";
import { MessageModule } from "primeng/message";

import { environment } from "src/environments/environment";

@Component({
  selector: "app-records",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    TableModule,
    InputTextModule,
    InputNumberModule,
    DialogModule,
    ConfirmDialogModule,
    FileUploadModule,
    TooltipModule,
    MessageModule,
  ],
  templateUrl: "./records.html",
  styleUrls: ["./records.css"],
  providers: [ConfirmationService, MessageService],
})
export class RecordsComponent implements OnInit {
  @ViewChild("form") form!: NgForm;
  @ViewChild("recordsTable") recordsTable!: ElementRef<HTMLTableElement>;
  visibleError = false;
  errorMessage = "";
  records: IRecord[] = [];
  filteredRecords: IRecord[] = [];
  visibleConfirm = false;
  imageRecord = "";
  visiblePhoto = false;
  photo = "";
  searchText: string = "";

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

  // Flag to track if a file has been selected

  groups: any[] = [];
  recordService: any;
  private resizeObserver!: ResizeObserver;
  private destroyRef = inject(DestroyRef);

  // Services injected using constructor
  constructor(
    private recordsService: RecordsService,
    private groupsService: GroupsService,
    private confirmationService: ConfirmationService,
    private stockService: StockService,
    private cartService: CartService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService
  ) {
    // This will run after the next change detection cycle
    afterNextRender(() => {
      this.updateTableVisuals();
    });
  }

  ngOnInit(): void {
    this.getRecords();
    this.getGroups();

    // Subscribe to stock updates
    this.stockService.stockUpdate$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ recordId, newStock }) => {
        const record = this.records.find((r) => r.IdRecord === recordId);
        if (record) {
          record.stock = newStock;
          // Update filtered records as well
          const filteredRecord = this.filteredRecords.find(
            (r) => r.IdRecord === recordId
          );
          if (filteredRecord) {
            filteredRecord.stock = newStock;
          }
        }
      });

    // Subscribe to cart updates
    this.cartService.cart$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cartItems) => {
        this.records.forEach((record) => {
          const cartItem = cartItems.find(
            (item) => item.IdRecord === record.IdRecord
          );
          record.inCart = !!cartItem;
          record.Amount = cartItem ? cartItem.Amount || 0 : 0;
        });
        this.filteredRecords = [...this.records];
      });
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private updateTableVisuals(): void {
    // Update any table visual elements
  }

  getRecords() {
    this.recordsService.getRecords().subscribe({
      next: (response: any) => {
        if (!response) {
          console.error("No data was received from the service");
          this.errorMessage = "No data was received from the service";
          this.visibleError = true;
          return;
        }

        // Handle different response formats
        let recordsArray = [];

        // Direct array response
        if (Array.isArray(response)) {
          recordsArray = response;
        }
        // Response with $values property (common in .NET)
        else if (Array.isArray(response.$values)) {
          recordsArray = response.$values;
        }
        // Response with data property
        else if (Array.isArray(response.data)) {
          recordsArray = response.data;
        }
        // Response with data as an object containing $values
        else if (response.data && Array.isArray(response.data.$values)) {
          recordsArray = response.data.$values;
        }
        // Single record response
        else if (response.data && typeof response.data === "object") {
          recordsArray = [response.data];
        }

        if (recordsArray.length === 0) {
          console.warn("No records were received from the service");
        }

        // Normalize the data to ensure consistent property names
        recordsArray = recordsArray.map((record: any) => {
          // Create a new object to avoid modifying the original
          const normalizedRecord = { ...record };

          // Handle case where server returns Stock instead of stock
          if (
            normalizedRecord.Stock !== undefined &&
            normalizedRecord.stock === undefined
          ) {
            normalizedRecord.stock = normalizedRecord.Stock;
            delete normalizedRecord.Stock;
          }

          // Ensure stock is a number
          if (typeof normalizedRecord.stock === "string") {
            normalizedRecord.stock = parseInt(normalizedRecord.stock, 10) || 0;
          }

          // Ensure image URL is properly set
          // Prefer ImageRecord if available, otherwise use PhotoName
          if (
            normalizedRecord.ImageRecord &&
            normalizedRecord.ImageRecord.trim() !== ""
          ) {
            normalizedRecord.PhotoName = normalizedRecord.ImageRecord.trim();
          } else if (
            normalizedRecord.PhotoName &&
            normalizedRecord.PhotoName.trim() !== ""
          ) {
            normalizedRecord.ImageRecord = normalizedRecord.PhotoName.trim();
          } else {
            normalizedRecord.PhotoName = "";
            normalizedRecord.ImageRecord = "";
          }

          return normalizedRecord;
        });

        // Get the groups to assign names
        this.groupsService.getGroups().subscribe({
          next: (groupsResponse: any) => {
            const groups = Array.isArray(groupsResponse)
              ? groupsResponse
              : Array.isArray(groupsResponse?.$values)
              ? groupsResponse.$values
              : [];

            // Assign the group name to each record
            recordsArray.forEach((record: IRecord) => {
              const group = groups.find(
                (g: any) =>
                  g.IdGroup === record.GroupId || g.idGroup === record.GroupId
              );
              if (group) {
                record.GroupName = group.NameGroup || group.nameGroup || "";
                // Ensure GroupId is a number
                if (typeof record.GroupId === "string") {
                  record.GroupId = parseInt(record.GroupId, 10);
                }
              }
            });

            this.records = recordsArray;
            this.filteredRecords = [...this.records];
            this.cdr.detectChanges();
          },
          error: (err: any) => {
            console.error("Error getting groups:", err);
            this.records = recordsArray;
            this.filteredRecords = [...this.records];
            this.cdr.detectChanges();
          },
        });
      },
      error: (err: any) => {
        console.error("Error getting records:", err);
        this.visibleError = true;
        this.controlError(err);
        this.cdr.detectChanges();
      },
    });
  }

  filterRecords() {
    if (!this.searchText?.trim()) {
      this.filteredRecords = [...this.records];
      return;
    }

    const searchTerm = this.searchText.toLowerCase();
    this.filteredRecords = this.records.filter((record) => {
      return (
        record.TitleRecord?.toLowerCase().includes(searchTerm) ||
        record.GroupName?.toLowerCase().includes(searchTerm) ||
        record.YearOfPublication?.toString().includes(searchTerm)
      );
    });
  }

  onSearchChange() {
    this.filterRecords();
  }

  getGroups() {
    this.groupsService.getGroups().subscribe({
      next: (response: any) => {
        // Flexible handling of different response structures
        let groupsArray = [];

        if (Array.isArray(response)) {
          // The answer is a direct array
          groupsArray = response;
        } else if (Array.isArray(response.$values)) {
          // The response has property $values
          groupsArray = response.$values;
        } else if (Array.isArray(response.data)) {
          // The response has data property
          groupsArray = response.data;
        } else {
          console.warn("Unexpected API response structure:", response);
        }

        this.groups = groupsArray;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error("Error loading groups:", err);
        this.visibleError = true;
        this.controlError(err);
        this.cdr.detectChanges();
      },
    });
  }

  showImage(record: IRecord): void {
    // Toggle visibility if clicking the same record's image
    if (this.visiblePhoto && this.record?.IdRecord === record.IdRecord) {
      this.visiblePhoto = false;
      return;
    }

    // Set the current record
    this.record = { ...record };

    // Handle the image source safely
    if (record.ImageRecord) {
      const imageUrl = record.ImageRecord.toString();

      // If it's a base64 string or a data URL
      if (imageUrl.startsWith("data:image")) {
        this.photo = imageUrl;
      }
      // If it's just a filename, construct the full URL
      else if (!imageUrl.startsWith("http")) {
        this.photo = `${environment.urlAPI}uploads/${imageUrl}`;
      }
      // If it's already a full URL
      else {
        this.photo = imageUrl;
      }
    } else {
      // Set a default image if no image is available
      this.photo = "assets/images/no-image-available.png";
      console.warn("No image available for record:", record.TitleRecord);
    }

    this.visiblePhoto = true;
  }

  save() {
    // Validate required fields
    if (!this.record.TitleRecord || this.record.TitleRecord.trim() === "") {
      console.error("Validation error: Title is required");
      this.messageService.add({
        severity: "error",
        summary: "Error",
        detail: "Please enter a title for the record",
        life: 3000,
      });
      return;
    }

    // Validate GroupId
    if (!this.record.GroupId) {
      console.error("Validation error: GroupId is required");
      this.messageService.add({
        severity: "error",
        summary: "Error",
        detail: "Please select a group for the record",
        life: 3000,
      });
      return;
    }

    // Create a copy of the record to avoid mutating the original
    const recordToSend = { ...this.record };

    // Ensure stock is a number
    if (typeof recordToSend.stock === "string") {
      recordToSend.stock = parseInt(recordToSend.stock as any, 10);
    }

    // Ensure Price is a number
    if (
      (!recordToSend.PhotoName || recordToSend.PhotoName.trim() === "") &&
      recordToSend.ImageRecord &&
      recordToSend.ImageRecord.trim() !== ""
    ) {
      recordToSend.PhotoName = recordToSend.ImageRecord.trim();
    }

    if (
      recordToSend.PhotoName &&
      recordToSend.PhotoName.trim() !== "" &&
      (!recordToSend.ImageRecord || recordToSend.ImageRecord.trim() === "")
    ) {
      recordToSend.ImageRecord = recordToSend.PhotoName.trim();
    }

    if (this.record.IdRecord === 0) {
      // Add new record
      this.recordsService.addRecord(recordToSend).subscribe({
        next: (response: any) => {
          this.messageService.add({
            severity: "success",
            summary: "Success",
            detail: "Record added successfully",
            life: 3000,
          });
          this.cancelEdition();
          this.getRecords();
        },
        error: (err) => {
          console.error("Error adding record:", err);
          this.handleSaveError(err);
        },
      });
    } else {
      // Update existing record
      this.recordsService.updateRecord(recordToSend).subscribe({
        next: (response: any) => {
          this.messageService.add({
            severity: "success",
            summary: "Success",
            detail: "Record updated successfully",
            life: 3000,
          });
          this.cancelEdition();
          this.getRecords();
        },
        error: (err) => {
          console.error("Error updating the record:", err);
          this.handleSaveError(err);
        },
      });
    }
  }

  private handleSaveError(err: any) {
    this.visibleError = true;

    // Enhanced error handling
    let errorMessage = "An error occurred while processing your request";

    if (err.status === 400) {
      // Handle 400 Bad Request with validation errors
      if (err.error && typeof err.error === "object") {
        // If the error has specific validation messages
        const errorObj = err.error;
        errorMessage =
          "Validation error: " + Object.values(errorObj).flat().join(" ");
      } else if (err.error && typeof err.error === "string") {
        errorMessage = err.error;
      }
    } else if (err.status === 401) {
      errorMessage = "Authentication required. Please log in again.";
    } else if (err.status === 403) {
      errorMessage = "You do not have permission to perform this action.";
    } else if (err.status === 404) {
      errorMessage = "The requested resource was not found.";
    } else if (err.status >= 500) {
      errorMessage = "A server error occurred. Please try again later.";
    }

    this.messageService.add({
      severity: "error",
      summary: "Error",
      detail: errorMessage,
      life: 5000,
    });

    this.controlError(err);
  }

  confirmDelete(record: IRecord) {
    this.confirmationService.confirm({
      message: `Delete record ${record.TitleRecord}?`,
      header: "Are you sure?",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Yes",
      acceptButtonStyleClass: "p-button-danger",
      accept: () => this.deleteRecord(record.IdRecord),
    });
  }

  deleteRecord(id: number) {
    this.recordsService.deleteRecord(id).subscribe({
      next: (data: any) => {
        this.visibleError = false;
        this.messageService.add({
          severity: "success",
          summary: "Success",
          detail: "Record deleted successfully",
          life: 3000,
        });
        this.getRecords();
      },
      error: (err: any) => {
        console.error("Error deleting record:", err);
        this.visibleError = true;

        let errorMessage = "An error occurred while deleting the record";

        if (err.status === 401) {
          errorMessage = "Authentication required. Please log in again.";
          // Optionally redirect to login
          // this.router.navigate(['/login']);
        } else if (err.status === 403) {
          errorMessage = "You do not have permission to delete this record";
        } else if (err.status === 404) {
          errorMessage = "Record not found or already deleted";
        } else if (err.response) {
          // Handle server response with error details
          if (err.response.message) {
            errorMessage = err.response.message;
          } else if (err.response.error) {
            errorMessage = err.response.error;
          }
        }

        this.messageService.add({
          severity: "error",
          summary: "Error",
          detail: errorMessage,
          life: 5000,
        });

        this.controlError(err);
        this.cdr.detectChanges();
      },
    });
  }

  edit(record: IRecord) {
    // Create a new object to avoid reference problems
    const recordCopy: IRecord = {
      IdRecord: record.IdRecord || 0,
      TitleRecord: record.TitleRecord || "",
      YearOfPublication: record.YearOfPublication || null,
      ImageRecord: record.ImageRecord || null,
      Photo: null, // We don't set Photo directly
      PhotoName: record.PhotoName || record.ImageRecord || null,
      Price: record.Price || 0,
      stock: record.stock || 0, // Default to 0 if undefined
      Discontinued: record.Discontinued || false,
      GroupId: record.GroupId || null,
      GroupName: record.GroupName || "",
      NameGroup: record.NameGroup || "",
    };

    // Assign the copy to the component's record
    this.record = recordCopy;

    // Force change detection to ensure the form updates
    this.cdr.detectChanges();

    // Scroll to the form smoothly
    setTimeout(() => {
      const formElement = document.querySelector(".form-container");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);

    // Reset form state after a short delay to ensure it's ready
    if (this.form) {
      // If the form has a dirty status, we mark it as clean.
      if (this.form.dirty) {
        this.form.form.markAsPristine();
      }

      // If the form has been touched, we mark it as untouched.
      if (this.form.touched) {
        this.form.form.markAsUntouched();
      }
    }
  }

  extractImageName(url: string): string {
    return url.split("/").pop() || "";
  }

  // ...
  cancelEdition() {
    // Reset the form first
    if (this.form) {
      this.form.resetForm();
    }

    // Reset the record object
    this.record = {
      IdRecord: 0,
      TitleRecord: "",
      YearOfPublication: null,
      ImageRecord: null,
      Photo: null,
      PhotoName: null,
      Price: 0,
      stock: 0,
      Discontinued: false,
      GroupId: null, // This will make the default option selected
      GroupName: "",
      NameGroup: "",
    };

    // Reset any form control states
    this.visibleError = false;
    this.errorMessage = "";
  }

  controlError(err: any) {
    if (err.error && typeof err.error === "object" && err.error.message) {
      this.errorMessage = err.error.message;
    } else if (typeof err.error === "string") {
      this.errorMessage = err.error;
    } else {
      this.errorMessage = "An unexpected error has occurred";
    }
  }

  addToCart(record: IRecord): void {
    const userEmail = this.userService.email;
    if (!userEmail) return;

    this.cartService.addToCart(record).subscribe(
      (response) => {
        // Update UI locally
        record.inCart = true;
        record.Amount = (record.Amount || 0) + 1;
        this.filteredRecords = [...this.records];
      },
      (error) => {
        console.error("Error adding to cart:", error);
        // Revert local changes if it fails
        record.inCart = false;
        record.Amount = 0;
        this.filteredRecords = [...this.records];
      }
    );
  }

  removeFromCart(record: IRecord): void {
    const userEmail = this.userService.email;
    if (!userEmail || !record.inCart) return;

    this.cartService.removeFromCart(record).subscribe(
      (response) => {
        // Update UI locally
        record.Amount = Math.max(0, (record.Amount || 0) - 1);
        record.inCart = record.Amount > 0;
        this.filteredRecords = [...this.records];
      },
      (error) => {
        console.error("Error removing from cart:", error);
        // Revert local changes if it fails
        record.Amount = (record.Amount || 0) + 1;
        record.inCart = true;
        this.filteredRecords = [...this.records];
      }
    );
  }
}
