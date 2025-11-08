import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectorRef,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewInit,
  ChangeDetectionStrategy,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, NgForm } from "@angular/forms";
import { Subject } from "rxjs";

// PrimeNG Modules
import { Table } from "primeng/table";
import { MessageService, ConfirmationService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { DialogModule } from "primeng/dialog";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { TableModule } from "primeng/table";
import { TooltipModule } from "primeng/tooltip";
import { MessageModule } from "primeng/message";
import { DropdownModule } from "primeng/dropdown";

// Services & Interfaces
import { IGroup, IGenre } from "../ecommerce.interface";
import { GroupsService } from "../services/groups";
import { GenresService } from "../services/genres";

// Environment
import { environment } from "../../../environments/environment";

@Component({
  selector: "app-groups",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    DialogModule,
    ConfirmDialogModule,
    TooltipModule,
    MessageModule,
    DropdownModule,
  ],
  templateUrl: "./groups.html",
  providers: [ConfirmationService, MessageService],
})
export class GroupsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild("form") form!: NgForm;
  visibleError = false;
  errorMessage = "";
  groups: IGroup[] = [];
  filteredGroups: IGroup[] = [];
  visibleConfirm = false;
  visiblePhoto = false;
  photo = "";
  searchText: string = "";
  selectedGenreId: string = "";

  group: IGroup = {
    IdGroup: 0,
    NameGroup: "",
    ImageGroup: null,
    Photo: null,
    MusicGenreId: "", // Using empty string as default value
    MusicGenreName: "",
    MusicGenre: "",
  };

  genres: any[] = [];
  @ViewChild("groupsTable") groupsTable!: ElementRef<HTMLTableElement>;
  private resizeObserver!: ResizeObserver;
  private destroy$ = new Subject<void>();

  // Services injected using inject()
  private groupsService = inject(GroupsService);
  private genresService = inject(GenresService);
  private confirmationService = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    // Initialize resize observer in ngAfterViewInit instead of using afterNextRender
  }

  ngOnInit(): void {
    this.getGroups();
    this.getGenres();
  }

  ngAfterViewInit(): void {
    this.setupTableResizeObserver();
  }

  getGroups() {
    this.groupsService.getGroups().subscribe({
      next: (data: any) => {
        // Directly assign the response array (without using .$values)
        this.groups = Array.isArray(data) ? data : [];
        this.filteredGroups = [...this.groups];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("Error fetching groups:", err);
        this.visibleError = true;
        this.errorMessage = "Failed to load groups. Please try again.";
        this.cdr.detectChanges();
      },
    });
  }

  getGenres() {
    this.genresService.getGenres().subscribe({
      next: (genres: IGenre[]) => {
        // Map genres ensuring values are strings
        this.genres = genres
          .filter(
            (genre) =>
              genre.IdMusicGenre !== undefined &&
              genre.NameMusicGenre !== undefined
          )
          .map((genre) => ({
            label: genre.NameMusicGenre!,
            value: genre.IdMusicGenre!.toString(),
          }));

        // Detect changes
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("Error loading genres:", err);
        this.visibleError = true;
        this.controlError(err);
        this.cdr.detectChanges();
      },
    });
  }

  filterGroups() {
    this.filteredGroups = this.groups.filter((group) =>
      group.NameGroup.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  // Function to compare values in the select
  compareFn(value1: any, value2: any): boolean {
    return value1 === value2;
  }

  private setupTableResizeObserver(): void {
    if (!this.groupsTable) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        console.log("The group table has been resized:", entry.contentRect);
        this.adjustTableColumns();
      });
    });

    this.resizeObserver.observe(this.groupsTable.nativeElement);
  }

  private adjustTableColumns(): void {
    if (!this.groupsTable) return;

    const table = this.groupsTable.nativeElement;
    const containerWidth = table.offsetWidth;
    const headers = table.querySelectorAll("th");

    // Adjust column widths based on container width
    if (containerWidth < 768) {
      // Mobile view
      headers.forEach((header, index) => {
        if (index > 1) {
          header.style.display = "none";
        } else {
          header.style.display = "table-cell";
          header.style.width = index === 0 ? "60%" : "40%";
        }
      });
    } else {
      // Desktop view
      headers.forEach((header) => {
        header.style.display = "table-cell";
        header.style.width = ""; // Restore default width
      });
    }
  }

  onSearchChange() {
    this.filterGroups();
  }

  // Reset form
  private resetForm() {
    // Reset the group object
    this.group = {
      IdGroup: 0,
      NameGroup: "",
      ImageGroup: "",
      Photo: null,
      MusicGenreId: "",
      MusicGenreName: "",
      MusicGenre: "",
    };

    // Reset the selected value of the select
    this.selectedGenreId = "";

    // Reset the form if it exists
    if (this.form) {
      // Save the form reference
      const formRef = this.form;

      // Reset the form
      formRef.resetForm();

      // Ensure the select shows the default option
      setTimeout(() => {
        if (formRef) {
          // Use patchValue with emitEvent false to avoid infinite loops
          formRef.form.patchValue(
            {
              name: "",
              genre: "",
              imageUrl: "",
            },
            { emitEvent: false }
          );

          // Mark as untouched and pristine
          formRef.form.markAsPristine();
          formRef.form.markAsUntouched();
          formRef.form.updateValueAndValidity();
        }
      });
    }

    // Force view update
    this.cdr.detectChanges();
  }

  // Handle errors
  private handleError(err: any) {
    console.error("Error:", err);
    this.visibleError = true;
    this.errorMessage = err?.error?.message || "An error occurred";
    this.cdr.detectChanges();
  }

  save() {
    // Ensure the MusicGenreId is set from the selectedGenreId
    if (this.selectedGenreId) {
      this.group.MusicGenreId = this.selectedGenreId;
    } else {
      // Handle case where no genre is selected
      this.visibleError = true;
      this.errorMessage = "Please select a music genre";
      this.cdr.detectChanges();
      return;
    }

    // If there is an image URL, ensure it is a valid URL
    if (this.group.ImageGroup && this.group.ImageGroup.trim() !== "") {
      if (!this.isValidUrl(this.group.ImageGroup)) {
        this.visibleError = true;
        this.errorMessage = "Please enter a valid image URL";
        this.cdr.detectChanges();
        return;
      }
      // Ensure the URL is clean (no leading or trailing spaces)
      this.group.ImageGroup = this.group.ImageGroup.trim();
    } else {
      // If no image URL, set as null
      this.group.ImageGroup = null;
    }

    const saveObservable =
      this.group.IdGroup === 0
        ? this.groupsService.addGroup(this.group)
        : this.groupsService.updateGroup(this.group);

    saveObservable.subscribe({
      next: (data) => {
        this.visibleError = false;
        this.resetForm();
        this.getGroups();
      },
      error: (err) => {
        console.error("Error saving group:", {
          error: err,
          status: err.status,
          statusText: err.statusText,
          url: err.url,
          errorDetails: err.error,
          groupData: this.group,
        });

        if (err.error && err.error.message) {
          this.errorMessage = err.error.message;
        } else if (err.status === 400) {
          this.errorMessage =
            "Invalid data. Please check the form and try again.";
        } else {
          this.errorMessage =
            "An error occurred while saving the group. Please try again.";
        }

        this.visibleError = true;
        this.cdr.detectChanges();
      },
    });
  }

  // Helper method to validate URLs
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (err) {
      return false;
    }
  }

  edit(group: IGroup) {
    // Create a copy of the group to avoid reference issues
    const groupCopy = { ...group };

    // Convert MusicGenreId to string if it exists, otherwise use empty string
    const musicGenreId = groupCopy.MusicGenreId?.toString() || "";

    // Update the group with the genre ID as a string
    this.group = {
      ...groupCopy,
      MusicGenreId: musicGenreId,
    };

    // Set the selectedGenreId for the dropdown
    this.selectedGenreId = musicGenreId;

    // Force the form model update in the next tick to ensure the form is ready
    setTimeout(() => {
      if (this.form) {
        const formRef = this.form;

        // Reset the form with the new values
        formRef.resetForm({
          name: groupCopy.NameGroup,
          genre: musicGenreId,
          imageUrl: groupCopy.ImageGroup || "",
        });

        // Mark as touched to show validation errors if needed
        formRef.form.markAllAsTouched();
        formRef.form.updateValueAndValidity();
      }

      // Force change detection
      this.cdr.detectChanges();
    });
  }

  extractNameImage(url: string): string {
    return url.split("/").pop() || "";
  }

  cancelEdition() {
    // Reset the group object
    this.group = {
      IdGroup: 0,
      NameGroup: "",
      ImageGroup: "",
      Photo: null,
      MusicGenreId: "",
      MusicGenreName: "",
      MusicGenre: "",
    };

    // Reset the selected value
    this.selectedGenreId = "";

    // Reset the form if it exists
    if (this.form) {
      this.form.reset();
    }

    // Force change detection
    this.cdr.detectChanges();
  }

  confirmDelete(group: IGroup) {
    this.confirmationService.confirm({
      message: `Delete the group ${group.NameGroup}?`,
      header: "Are you sure?",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Yes",
      acceptButtonStyleClass: "p-button-danger",
      accept: () => this.deleteGroup(group.IdGroup!),
    });
  }

  deleteGroup(id: number) {
    this.groupsService.deleteGroup(id).subscribe({
      next: (data) => {
        this.visibleError = false;
        // Use resetForm to clear the form and reset the select
        this.resetForm();
        // Update the list of groups
        this.getGroups();
      },
      error: (err) => {
        this.visibleError = true;
        this.controlError(err);
      },
    });
  }

  private controlError(err: any) {
    if (err.error && typeof err.error === "object" && err.error.message) {
      this.errorMessage = err.error.message;
    } else if (typeof err.error === "string") {
      this.errorMessage = err.error;
    } else {
      this.errorMessage = "An unexpected error has occurred";
    }
    this.visibleError = true;
    this.cdr.detectChanges();
  }

  showImage(group: IGroup): void {
    // Toggle visibility if clicking the same group's image
    if (this.visiblePhoto && this.group?.IdGroup === group.IdGroup) {
      this.visiblePhoto = false;
      return;
    }

    // Set the current group
    this.group = { ...group };

    // Handle the image source safely
    if (group.ImageGroup) {
      const imageUrl = group.ImageGroup.toString();

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
      console.warn("No image available for group:", group.NameGroup);
    }

    this.visiblePhoto = true;
  }

  ngOnDestroy(): void {
    // Clean up the resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.destroy$.next();
    this.destroy$.complete();
  }
}
