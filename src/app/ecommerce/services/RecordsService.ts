import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Observable, tap, map, catchError, throwError } from "rxjs";
import { environment } from "src/environments/environment";
import { AuthGuard } from "src/app/guards/AuthGuardService";
import { IRecord } from "../EcommerceInterface";
import { StockService } from "./StockService";

@Injectable({
  providedIn: "root",
})
export class RecordsService {
  urlAPI = environment.urlAPI;
  constructor(
    private http: HttpClient,
    private authGuard: AuthGuard,
    private stockService: StockService
  ) {}

  getRecords(): Observable<IRecord[]> {
    const headers = this.getHeaders();

    return this.http.get<any>(`${this.urlAPI}records`, {
      headers,
      observe: 'response' // Get full response including status and headers
    }).pipe(
      map((response) => {
        const body = response.body;

        if (!body) {
          console.warn('Empty response body');
          return [];
        }

        // Handle different possible response structures
        const records = body.$values || body.data || (Array.isArray(body) ? body : []);

        if (!Array.isArray(records)) {
          console.warn('Unexpected response format, expected an array but got:', typeof records);
          return [];
        }

        return records;
      }),
      tap((records) => {
        records.forEach((record) => {
          this.stockService.notifyStockUpdate(record.IdRecord, record.Stock);
        });
      }),
      catchError(error => {
        console.error('Error in getRecords:', error);
        console.error('Error status:', error.status);
        console.error('Error message:', error.message);
        console.error('Error response:', error.error);
        return throwError(() => error);
      })
    );
  }

  addRecord(record: IRecord): Observable<IRecord> {

    // Get token from sessionStorage or localStorage
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
      console.error('No se encontró el token de autenticación');
      return throwError(() => new Error('No autenticado - Por favor inicia sesión nuevamente'));
    }

    // Create headers with the token
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });

    // Prepare the request body
    const requestBody = {
      TitleRecord: record.TitleRecord,
      YearOfPublication: record.YearOfPublication,
      Price: record.Price,
      Stock: record.stock,
      Discontinued: record.Discontinued,
      GroupId: record.GroupId,
      ImageRecord: record.PhotoName || null
    };

    return new Observable<IRecord>(subscriber => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.urlAPI}records`, true);

      // Set headers
      headers.keys().forEach(key => {
        xhr.setRequestHeader(key, headers.get(key) || '');
      });

      xhr.onload = () => {

        try {
          const response = xhr.responseText ? JSON.parse(xhr.responseText) : {};

          if (xhr.status >= 200 && xhr.status < 300) {
            subscriber.next(response);
            subscriber.complete();
          } else {
            const error = new Error(xhr.statusText) as any;
            error.status = xhr.status;
            error.response = response;
            console.error('Error in server response:', error);
            subscriber.error(error);
          }
        } catch (e) {
          console.error('Error processing server response:', e);
          subscriber.error(e);
        }
      };

      xhr.onerror = () => {
        console.error('Network error while trying to create record');
        subscriber.error(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        console.error('Request timed out');
        subscriber.error(new Error('Request timed out'));
      };

      try {
        xhr.send(JSON.stringify(requestBody));
      } catch (e) {
        console.error('Error sending request:', e);
        subscriber.error(e);
      }

      // Cleanup function
      return () => {
        if (xhr.readyState !== 4) { // If request is not completed
          xhr.abort();
          console.log('Request aborted');
        }
      };
    });
  }

  updateRecord(record: IRecord): Observable<IRecord> {

    // Get the authentication token
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return throwError(() => new Error('Not authenticated - Please log in again'));
    }

    // Set up headers with the token
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });

    // Prepare the data to send, excluding the Photo file
    const recordToSend = {
      IdRecord: record.IdRecord,
      TitleRecord: record.TitleRecord,
      YearOfPublication: record.YearOfPublication,
      Price: record.Price,
      stock: record.stock,
      Discontinued: record.Discontinued,
      GroupId: record.GroupId,
      PhotoName: record.PhotoName || record.ImageRecord || null,
      // ImageRecord is managed server-side based on PhotoName
    };

    return this.http.put<IRecord>(
      `${this.urlAPI}records/${record.IdRecord}`,
      recordToSend,
      {
        headers,
        observe: 'response'
      }
    ).pipe(
      map(response => {
        return response.body as IRecord;
      }),
      catchError((error: any) => {
        console.error('Error updating the record:', error);

        // Log detailed error information if available
        if (error.error) {
          if (typeof error.error === 'object') {
            console.error('Error details:', JSON.stringify(error.error, null, 2));
          } else {
            console.error('Error message:', error.error);
          }
        }

        return throwError(() => ({
          status: error.status,
          message: error.error?.message || error.message,
          errors: error.error?.errors || null
        }));
      })
    );
  }

  deleteRecord(id: number): Observable<IRecord> {

    // Get token from sessionStorage or localStorage
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    if (!token) {
      const error = new Error('No authentication token found') as any;
      console.error('Authentication error:', error);
      return throwError(() => error);
    }

    return new Observable<IRecord>(subscriber => {
      const xhr = new XMLHttpRequest();
      xhr.open('DELETE', `${this.urlAPI}records/${id}`, true);

      // Set headers
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = () => {
        try {

          let responseData;
          try {
            responseData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          } catch (e) {
            responseData = xhr.responseText;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            // Successful deletion
            subscriber.next(responseData || { success: true });
            subscriber.complete();
          } else {
            const error = new Error(xhr.statusText || 'Error deleting record') as any;
            error.status = xhr.status;
            error.response = responseData;
            console.error('Delete error:', error);
            subscriber.error(error);
          }
        } catch (e) {
          console.error('Error processing delete response:', e);
          subscriber.error(e);
        }
      };

      xhr.onerror = () => {
        const error = new Error('Network error during delete operation');
        console.error('Network error during delete:', error);
        subscriber.error(error);
      };

      xhr.send();

      // Cleanup function
      return () => xhr.abort();
    });
  }

  getRecordsByGroup(idGroup: string | number): Observable<IRecord[]> {
    const headers = this.getHeaders();
    return this.http
      .get<any>(`${this.urlAPI}groups/${idGroup}`, { headers })
      .pipe(
        map((response) => {

          if (!response.success || !response.data) {
            console.warn('Invalid response format or no data:', response);
            return [];
          }

          const groupData = response.data;
          const records = groupData.Records || [];
          const groupName = groupData.NameGroup || '';

          if (!Array.isArray(records)) {
            console.warn('Records is not an array:', records);
            return [];
          }

          // Map the records to the expected format
          return records.map((record: any) => ({
            IdRecord: record.IdRecord,
            TitleRecord: record.TitleRecord,
            YearOfPublication: record.YearOfPublication,
            Price: parseFloat(record.Price) || 0,
            stock: record.Stock || 0,
            Discontinued: record.Discontinued || false,
            GroupId: record.GroupId || groupData.IdGroup,
            GroupName: groupName,
            ImageRecord: record.ImageRecord || '',
            Photo: record.ImageRecord || null,
            PhotoName: record.ImageRecord ? record.ImageRecord.split('/').pop() || null : null,
          } as IRecord));
        }),
        tap((records) => {
          records.forEach((record) => {
            if (record && record.IdRecord && record.stock !== undefined) {
              this.stockService.notifyStockUpdate(
                record.IdRecord,
                record.stock
              );
            }
          });
        })
      );
  }

  decrementStock(idRecord: number): Observable<any> {
    const headers = this.getHeaders();
    const amount = -1;
    return this.http
      .put(
        `${this.urlAPI}records/${idRecord}/updateStock/${amount}`,
        {},
        { headers }
      )
      .pipe(
        tap(() => {
          this.stockService.notifyStockUpdate(idRecord, amount);
        })
      );
  }

  incrementStock(idRecord: number): Observable<any> {
    const headers = this.getHeaders();
    const amount = 1;
    return this.http
      .put(
        `${this.urlAPI}records/${idRecord}/updateStock/${amount}`,
        {},
        { headers }
      )
      .pipe(
        tap(() => {
          this.stockService.notifyStockUpdate(idRecord, amount);
        })
      );
  }

  getRecordById(id: number): Observable<IRecord> {
    const headers = this.getHeaders();
    return this.http
      .get<IRecord>(`${this.urlAPI}records/${id}`, { headers })
      .pipe(
        catchError((error) => {
          return throwError(() => error);
        })
      );
  }

  private getHeaders(): HttpHeaders {
    // First try to get the sessionStorage token
    let token = sessionStorage.getItem('token');

    // If not in sessionStorage, try localStorage
    if (!token) {
      token = localStorage.getItem('token');
    }

    // If no token, return headers without authentication
    if (!token) {
      return new HttpHeaders({
        'Content-Type': 'application/json'
      });
    }

    // If there is a token, include it in the headers
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }
}
