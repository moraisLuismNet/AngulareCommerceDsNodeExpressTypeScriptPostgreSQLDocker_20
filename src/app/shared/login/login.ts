import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  inject,
  DestroyRef,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { FormsModule, NgForm } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { MessageService } from "primeng/api";
import { ILogin, ILoginResponse } from "src/app/interfaces/login.interface";
import { AppService } from "src/app/services/app";
import { AuthGuard } from "src/app/guards/auth-guard";
import { UserService } from "src/app/services/user";
import { jwtDecode } from "jwt-decode";
import { InputTextModule } from "primeng/inputtext";
import { ButtonModule } from "primeng/button";
import { PasswordModule } from "primeng/password";
import { ToastModule } from "primeng/toast";
import { MessagesModule } from "primeng/messages";

@Component({
  selector: "app-login",
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    InputTextModule,
    ButtonModule,
    PasswordModule,
    ToastModule,
    MessagesModule,
  ],
  templateUrl: "./login.html",
  styleUrls: ["./login.css"],
  providers: [MessageService],
})
export class LoginComponent implements OnInit {
  @ViewChild("emailInput") emailInput!: ElementRef<HTMLInputElement>;
  @ViewChild("fLogin") loginForm!: NgForm;

  infoLogin: ILogin = {
    email: "",
    password: "",
    role: "",
  };

  // Services injected using inject()
  private router = inject(Router);
  private appService = inject(AppService);
  private messageService = inject(MessageService);
  private authGuard = inject(AuthGuard);
  private userService = inject(UserService);
  private destroyRef = inject(DestroyRef);

  constructor() {}

  ngOnInit() {
    this.userService.setEmail(this.infoLogin.email);
    if (this.authGuard.isLoggedIn()) {
      this.router.navigateByUrl("/ecommerce/listgroups");
    }
  }

  ngAfterViewInit() {
    if (this.emailInput) {
      this.emailInput.nativeElement.focus();
    }
  }

  login() {
    this.appService
      .login(this.infoLogin)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: ILoginResponse) => {
          if (!data || !data.token) {
            throw new Error("No token received from server");
          }

          try {
            const decodedToken: any = jwtDecode(data.token);

            // Try to get the role in different ways
            const roleClaim =
              "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
            let role =
              decodedToken?.[roleClaim] ||
              decodedToken?.role ||
              data.role ||
              "User";

            // Store the token and user data
            sessionStorage.setItem("token", data.token);
            sessionStorage.setItem("user", JSON.stringify({ ...data, role }));

            // Update the user service
            this.userService.setEmail(this.infoLogin.email);
            this.userService.setRole(role);

            // Redirect based on role
            this.userService.redirectBasedOnRole();
          } catch (error) {
            console.error("Error processing login response:", error);
            this.messageService.add({
              severity: "error",
              summary: "Error",
              detail: "Invalid token received from server",
            });
          }
        },
        error: (err) => {
          console.error("Login error:", err);
          let errorMessage = "Wrong credentials";

          if (err?.error?.message) {
            errorMessage = err.error.message;
          } else if (err?.status === 0) {
            errorMessage =
              "Unable to connect to the server. Please check your connection.";
          } else if (err?.status === 401) {
            errorMessage = "Invalid email or password";
          }

          this.messageService.add({
            severity: "error",
            summary: "Login Failed",
            detail: errorMessage,
          });
        },
      });
  }
}
