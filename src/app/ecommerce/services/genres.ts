import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "src/environments/environment";
import { AuthGuard } from "src/app/guards/auth-guard";
import { IGenre } from "../ecommerce.interface";

@Injectable({
  providedIn: "root",
})
export class GenresService {
  urlAPI = environment.urlAPI;
  constructor(private http: HttpClient, private authGuard: AuthGuard) {}

  getGenres(): Observable<IGenre[]> {
    const headers = this.getHeaders();

    return new Observable<IGenre[]>((subscriber) => {
      this.http.get<any>(`${this.urlAPI}music-genres`, { headers }).subscribe({
        next: (response) => {
          let genres: IGenre[] = [];

          // Handle different response formats
          if (Array.isArray(response)) {
            // If the response is a direct array
            genres = response.map((item) => ({
              IdMusicGenre: item.IdMusicGenre || item.idMusicGenre || 0,
              NameMusicGenre: item.NameMusicGenre || item.nameMusicGenre || "",
              TotalGroups: item.TotalGroups || item.totalGroups || 0,
            }));
          } else if (
            response &&
            response.$values &&
            Array.isArray(response.$values)
          ) {
            // If the response has a $values property
            genres = response.$values.map((item: any) => ({
              IdMusicGenre: item.IdMusicGenre || item.idMusicGenre || 0,
              NameMusicGenre: item.NameMusicGenre || item.nameMusicGenre || "",
              TotalGroups: item.TotalGroups || item.totalGroups || 0,
            }));
          } else if (
            response &&
            response.data &&
            Array.isArray(response.data)
          ) {
            // If the response has a data property
            genres = response.data.map((item: any) => ({
              IdMusicGenre: item.IdMusicGenre || item.idMusicGenre || 0,
              NameMusicGenre: item.NameMusicGenre || item.nameMusicGenre || "",
              TotalGroups: item.TotalGroups || item.totalGroups || 0,
            }));
          } else {
            console.warn("Unexpected response format:", response);
          }

          subscriber.next(genres);
          subscriber.complete();
        },
        error: (error) => {
          console.error("Error:", error);
          console.error("Error status:", error.status);
          console.error("Error message:", error.message);
          console.error("Error complete:", error);
          subscriber.error(error);
        },
      });
    });
  }

  addGenre(genre: IGenre): Observable<IGenre> {
    const headers = this.getHeaders();

    // Create the request body with the correct property names
    const requestBody = {
      nameMusicGenre: genre.NameMusicGenre,
      totalGroups: genre.TotalGroups || 0,
    };

    return new Observable<IGenre>((subscriber) => {
      this.http
        .post<any>(`${this.urlAPI}music-genres`, requestBody, {
          headers: headers.set("Content-Type", "application/json"),
        })
        .subscribe({
          next: (response) => {
            // Handle different response formats
            const result: IGenre = {
              IdMusicGenre: response.IdMusicGenre || response.idMusicGenre || 0,
              NameMusicGenre:
                response.NameMusicGenre || response.nameMusicGenre || "",
              TotalGroups: response.TotalGroups || response.totalGroups || 0,
            };
            subscriber.next(result);
            subscriber.complete();
          },
          error: (error) => {
            console.error("Error:", error);
            console.error("Error details:", error.error);
            subscriber.error(error);
          },
        });
    });
  }

  updateGenre(genre: IGenre): Observable<IGenre> {
    const headers = this.getHeaders();

    // Create the request body with the correct property names
    const requestBody = {
      idMusicGenre: genre.IdMusicGenre,
      nameMusicGenre: genre.NameMusicGenre,
      totalGroups: genre.TotalGroups || 0,
    };

    return new Observable<IGenre>((subscriber) => {
      this.http
        .put<any>(
          `${this.urlAPI}music-genres/${genre.IdMusicGenre}`,
          requestBody,
          {
            headers: headers.set("Content-Type", "application/json"),
          }
        )
        .subscribe({
          next: (response) => {
            // Handle different response formats
            const result: IGenre = {
              IdMusicGenre:
                response.IdMusicGenre ||
                response.idMusicGenre ||
                genre.IdMusicGenre,
              NameMusicGenre:
                response.NameMusicGenre ||
                response.nameMusicGenre ||
                genre.NameMusicGenre,
              TotalGroups: response.TotalGroups || response.totalGroups || 0,
            };
            subscriber.next(result);
            subscriber.complete();
          },
          error: (error) => {
            console.error("Error:", error);
            subscriber.error(error);
          },
        });
    });
  }

  deleteGenre(idMusicGenre: number): Observable<IGenre> {
    const headers = this.getHeaders();

    return new Observable<IGenre>((subscriber) => {
      this.http
        .delete<any>(`${this.urlAPI}music-genres/${idMusicGenre}`, { headers })
        .subscribe({
          next: (response) => {
            // Handle different response formats
            const result: IGenre = {
              IdMusicGenre: idMusicGenre,
              NameMusicGenre: "",
              TotalGroups: 0,
            };
            subscriber.next(result);
            subscriber.complete();
          },
          error: (error) => {
            console.error("Error:", error);
            subscriber.error(error);
          },
        });
    });
  }

  getHeaders(): HttpHeaders {
    const token = this.authGuard.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return headers;
  }
}
