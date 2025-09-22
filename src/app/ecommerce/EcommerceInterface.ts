export interface IGenre {
  IdMusicGenre?: number;
  NameMusicGenre: string;
  TotalGroups?: number;
}

export interface IGroup {
  IdGroup: number;
  NameGroup: string;
  ImageGroup: string | null;
  Photo?: File | null;
  PhotoName?: string | null;
  TotalRecords?: number;
  MusicGenreId: number | string;  
  MusicGenreName: string;
  MusicGenre: string;
}

export interface IRecord {
  IdRecord: number;
  TitleRecord: string;
  YearOfPublication: number | null;
  Price: number;
  stock: number;
  Discontinued: boolean;
  GroupId: number | null;
  GroupName: string;
  NameGroup: string;
  inCart?: boolean;
  Amount?: number;
  ImageRecord: string | null;
  Photo: File | null;
  PhotoName: string | null;
  data?: {
    stock?: number;
    [key: string]: any;
  };
}

export interface ICartDetail {
  RecordTitle: string;
  IdCartDetail?: number;
  RecordId: number;
  Amount: number;
  CartId: number;
  Record?: IRecord;
  TitleRecord?: string;
  GroupName?: string;
  Price?: number;
  Total?: number;
  // camelCase for template compatibility
  idCartDetail?: number;
  recordId?: number;
  amount?: number;
  cartId?: number;
  titleRecord?: string;
  groupName?: string;
  price?: number;
  total?: number;
  imageRecord?: string | null;
}

export interface ICart {
  CartDetails?: any;
  IdCart: number;
  UserEmail: string;
  TotalPrice: number;
  Enabled?: boolean;
}

export interface IOrder {
  IdOrder: number;
  OrderDate: string;
  PaymentMethod: string;
  Total: number;
  UserEmail: string;
  CartId: number;
  OrderDetails: IOrderDetail[];
}

export interface IOrderDetail {
  IdOrderDetail: number;
  OrderId: number;
  RecordId: number;
  RecordTitle?: string;
  Amount: number;
  Price: number;
  Total: number;
}

export interface IUser {
  Email: string;
  Role: string;
  Name?: string; 
}

export interface CartDetailItem {
  idCartDetail: number;
  cartId: number;
  recordId: number;
  imageRecord: string;
  titleRecord: string;
  groupName: string;
  amount: number;
  price: number;
  total: number;
}

export interface ExtendedCartDetail extends Omit<ICartDetail, 'recordTitle'> {
  stock?: number;
  groupName?: string;
  price?: number;
  imageRecord?: string | null;
}

export interface GroupResponse {
  $values?: IGroup[];
}