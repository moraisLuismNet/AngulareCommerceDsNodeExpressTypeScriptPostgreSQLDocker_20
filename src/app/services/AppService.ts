import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ILogin, ILoginResponse } from '../interfaces/LoginInterface';

interface LoginApiResponse {
  success: boolean;
  message: string;
  data?: {
    email?: string;
    token: string;
    role?: string;
  };
}

export interface IRegister {
  email: string;
  password: string;
  role?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppService {
  urlAPI: string;

  constructor(private http: HttpClient) {
    this.urlAPI = environment.urlAPI;
  }

  login(credentials: ILogin): Observable<ILoginResponse> {
    return this.http.post<LoginApiResponse>(
      `${this.urlAPI}auth/login`,
      credentials
    ).pipe(
      map((response: LoginApiResponse) => {
        if (!response || !response.success || !response.data || !response.data.token) {
          throw new Error(response?.message || 'Invalid response format from server');
        }
        // Map the nested response to the expected ILoginResponse format
        return {
          email: response.data.email || credentials.email,
          token: response.data.token,
          role: response.data.role
        } as ILoginResponse;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Login request failed:', error);
        return throwError(() => new Error(error.error?.message || 'Login failed'));
      })
    );
  }

  register(user: IRegister) {
    return this.http.post<any>(`${this.urlAPI}auth/register`, user);
  }
}
