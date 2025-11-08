import { Injectable } from "@angular/core";
import {
  Router,
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from "@angular/router";
import { ILoginResponse } from "../interfaces/login.interface";
import { jwtDecode } from "jwt-decode";
import { Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router) {}

  getRole(): string {
    const userData = sessionStorage.getItem("user");
    if (userData) {
      const user: ILoginResponse = JSON.parse(userData);
      return user.role || "";
    }
    return "";
  }

  isLoggedIn(): boolean {
    return !!sessionStorage.getItem("user");
  }

  getUser(): string {
    const infoUser = sessionStorage.getItem("user");
    if (infoUser) {
      const userInfo: ILoginResponse = JSON.parse(infoUser);
      return userInfo.email;
    }
    return "";
  }

  getToken(): string {
    const infoUser = sessionStorage.getItem("user");
    if (infoUser) {
      const userInfo: ILoginResponse = JSON.parse(infoUser);
      return userInfo.token;
    }
    return "";
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    if (this.isLoggedIn()) {
      // Check if the route requires administrator role
      const requiresAdmin = route.data["requiresAdmin"] || false;
      if (requiresAdmin && !this.isAdmin()) {
        this.router.navigate(["/"]);
        return false;
      }
      return true;
    }

    // Redirect to login if not authenticated
    this.router.navigate(["/login"], { queryParams: { returnUrl: state.url } });
    return false;
  }

  isAdmin(): boolean {
    const userData = sessionStorage.getItem("user");
    if (userData) {
      const user: ILoginResponse = JSON.parse(userData);
      return user.role?.toLowerCase() === "admin";
    }
    return false;
  }

  getCartId(): number | null {
    const token = this.getToken();
    if (token) {
      try {
        const decodedToken: any = jwtDecode(token);
        const cartId = decodedToken["CartId"];
        return cartId !== undefined ? Number(cartId) : null;
      } catch (error) {
        console.error("Error decoding token:", error);
        return null;
      }
    }
    return null;
  }
}
