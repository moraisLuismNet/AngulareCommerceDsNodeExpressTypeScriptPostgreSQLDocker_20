import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthGuard } from 'src/app/guards/AuthGuardService';
import { IGroup } from '../EcommerceInterface';

@Injectable({
  providedIn: 'root',
})
export class GroupsService {
  urlAPI = environment.urlAPI;
  constructor(private http: HttpClient, private authGuard: AuthGuard) {}

  // Helper method to validate URLs
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (err) {
      return false;
    }
  }

  getGroups(): Observable<IGroup[]> {
    const headers = this.getHeaders();

    return this.http
      .get<any>(`${this.urlAPI}groups`, { headers })
      .pipe(
        catchError((error) => {
          console.error('Error in the request:', error);
          if (error.error) {
            console.error('Error details:', error.error);
          }
          return throwError(() => error);
        }),
        map((response: { success: boolean; data: any[] }) => {
          if (response?.success && response?.data && Array.isArray(response.data)) {
            // Map the server data to the expected frontend format
            return response.data.map((group: any) => {
              // Handle image URL construction
              let imageUrl = group.ImageGroup || '';

              // If image path is not empty and not already a full URL
              if (imageUrl && !imageUrl.startsWith('http')) {
                // Remove leading slash if present
                const cleanPath = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;

                // If the path doesn't already include 'assets', prepend it
                if (!cleanPath.includes('assets/')) {
                  imageUrl = `assets/img/${cleanPath}`;
                } else {
                  imageUrl = cleanPath;
                }
              }

              return {
                IdGroup: group.IdGroup,
                NameGroup: group.NameGroup,
                ImageGroup: imageUrl,
                Photo: null,
                PhotoName: group.ImageGroup ? group.ImageGroup.split('/').pop() || null : null,
                MusicGenreId: group.MusicGenreId,
                MusicGenreName: group.NameMusicGenre || 'Genderless',
                MusicGenre: group.NameMusicGenre || 'Genderless',
                totalRecords: group.TotalRecords || 0
              } as IGroup;
            });
          }
          return [];
        }),
        catchError(error => {
          console.error('Error in getGroups:', error);
          if (error.error) {
            console.error('Error details:', error.error);
          }
          return throwError(() => error);
        })
      );
  }

  addGroup(group: IGroup): Observable<IGroup> {
    // Get headers with JSON content type
    const token = this.authGuard.getToken();
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    // Validate required fields
    if (!group.NameGroup || group.MusicGenreId === undefined) {
      const errorMessage = 'Missing required fields: ' +
        (!group.NameGroup ? 'Group name, ' : '') +
        (group.MusicGenreId === undefined ? 'Music genre ID' : '');

      console.error('Validation error:', errorMessage);
      return throwError(() => ({
        error: { message: errorMessage },
        status: 400,
        statusText: 'Bad Request'
      }));
    }

    try {
      // Prepare the request body as a JSON object
      const requestBody = {
        NameGroup: group.NameGroup,
        MusicGenreId: group.MusicGenreId,
        ImageGroup: group.ImageGroup?.trim() || null
      };

      return this.http.post<any>(`${this.urlAPI}groups`, requestBody, {
        headers: headers,
        observe: 'response',
        withCredentials: true // Include credentials if needed
      }).pipe(
        map(response => {
          // Ensure the response body has the expected structure
          if (response.body && response.body.success && response.body.data) {
            return response.body.data;
          }
          return response.body || group;
        }),
        catchError(error => {
          console.error('Error in addGroup:', {
            status: error.status,
            statusText: error.statusText,
            error: error.error,
            url: error.url,
            headers: error.headers
          });
          return throwError(() => error);
        })
      );
    } catch (error) {
      console.error('Unexpected error in addGroup:', error);
      return throwError(() => ({
        error: { message: 'An unexpected error occurred' },
        status: 500,
        statusText: 'Internal Server Error'
      }));
    }
  }

  updateGroup(group: IGroup): Observable<IGroup> {
    // Get headers with JSON content type
    const token = this.authGuard.getToken();
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    // Ensure all required fields are included
    if (!group.IdGroup || !group.NameGroup || group.MusicGenreId === undefined) {
      const error = new Error('Missing required fields: ' +
        (!group.IdGroup ? 'IdGroup, ' : '') +
        (!group.NameGroup ? 'NameGroup, ' : '') +
        (group.MusicGenreId === undefined ? 'MusicGenreId' : '')
      );
      console.error('Validation error:', error.message);
      return new Observable(subscriber => {
        subscriber.error(error);
      });
    }

    // Prepare the request body as a JSON object
    const requestBody = {
      NameGroup: group.NameGroup,
      MusicGenreId: group.MusicGenreId,
      ImageGroup: group.ImageGroup?.trim() || null
    };

    return new Observable<IGroup>(subscriber => {
      this.http.put<any>(
        `${this.urlAPI}groups/${group.IdGroup}`,
        requestBody,
        {
          headers: headers,
          observe: 'response'
        }
      ).subscribe({
        next: (response) => {
          if (response.body && response.body.success && response.body.data) {
            subscriber.next(response.body.data);
          } else if (response.body) {
            subscriber.next(response.body);
          } else {
            subscriber.next(group); // Return the original group if no response body
          }
          subscriber.complete();
        },
        error: (error) => {
          console.error('Update error:', {
            status: error.status,
            statusText: error.statusText,
            error: error.error,
            url: error.url,
            headers: error.headers
          });
          subscriber.error(error);
        }
      });
    });
  }

  deleteGroup(id: number): Observable<IGroup> {
    const headers = this.getHeaders();
    return this.http.delete<IGroup>(`${this.urlAPI}groups/${id}`, {
      headers,
    });
  }

  getGroupName(idGroup: string | number): Observable<string> {
    const headers = this.getHeaders();
    return this.http
      .get<any>(`${this.urlAPI}groups/${idGroup}`, { headers })
      .pipe(
        map((response) => {

          // Handle direct group object
          if (
            response &&
            typeof response === 'object' &&
            'nameGroup' in response
          ) {
            return response.nameGroup;
          }

          // Handle $values wrapper
          if (
            response &&
            response.$values &&
            typeof response.$values === 'object'
          ) {
            if (
              Array.isArray(response.$values) &&
              response.$values.length > 0
            ) {
              return response.$values[0].nameGroup || '';
            }
            if ('nameGroup' in response.$values) {
              return response.$values.nameGroup;
            }
          }

          return '';
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
}
